import ExpoModulesCore
import AuthenticationServices

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

public class BetterAuthReactNativePasskeyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BetterAuthReactNativePasskey")

    AsyncFunction("registerPasskey") { (input: [String: Any], promise: Promise) in
      self.createPasskey(input: input, promise: promise)
    }

    AsyncFunction("authenticatePasskey") { (input: [String: Any], promise: Promise) in
      self.getPasskey(input: input, promise: promise)
    }
  }

  // MARK: - Registration

  private func createPasskey(input: [String: Any], promise: Promise) {
    guard let options = input["optionsJSON"] as? [String: Any],
          let rp = options["rp"] as? [String: Any],
          let rpId = rp["id"] as? String, !rpId.isEmpty,
          let challengeStr = options["challenge"] as? String,
          let challenge = fromBase64URL(challengeStr),
          let user = options["user"] as? [String: Any],
          let userIdStr = user["id"] as? String,
          let userId = fromBase64URL(userIdStr),
          let userName = user["name"] as? String else {
      promise.reject("INVALID_OPTIONS", "Missing or invalid required registration options")
      return
    }

    let userDisplayName = (user["displayName"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? userName
    let passkeyName = userName.isEmpty ? userDisplayName : userName

    let authSelection = options["authenticatorSelection"] as? [String: Any]
    let attachment = (authSelection?["authenticatorAttachment"] as? String)?.lowercased()
    let uvPref = (authSelection?["userVerification"] as? String)?.toUserVerificationPreference() ?? .preferred
    let attestationPref = (options["attestation"] as? String)?.toAttestationPreference() ?? .none

    let excludeDescriptors = (options["excludeCredentials"] as? [[String: Any]]) ?? []
    var requests: [ASAuthorizationRequest] = []

    // 1. Platform Authenticator Request (Face ID / Touch ID / iCloud Keychain)
    if attachment != "cross-platform" {
      let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
      let request = provider.createCredentialRegistrationRequest(challenge: challenge, name: passkeyName, userID: userId)
      request.userVerificationPreference = uvPref
      request.attestationPreference = attestationPref

      if #available(iOS 17.4, macOS 14.4, *) {
        request.excludedCredentials = excludeDescriptors.compactMap { dict -> ASAuthorizationPlatformPublicKeyCredentialDescriptor? in
          guard let idStr = dict["id"] as? String, let id = fromBase64URL(idStr) else { return nil }
          return ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: id)
        }
      }
      requests.append(request)
    }

    // 2. Security Key Request (FIDO2 USB / NFC / BLE)
    if attachment != "platform" {
      let provider = ASAuthorizationSecurityKeyPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
      let request = provider.createCredentialRegistrationRequest(
        challenge: challenge,
        displayName: userDisplayName,
        name: passkeyName,
        userID: userId
      )
      request.userVerificationPreference = uvPref
      request.attestationPreference = attestationPref
      request.residentKeyPreference = authSelection?.toResidentKeyPreference() ?? .preferred

      let rawParams = (options["pubKeyCredParams"] as? [[String: Any]]) ?? []
      let algs: [Int] = rawParams.compactMap { dict in
        if let alg = dict["alg"] as? Int { return alg }
        if let alg = dict["alg"] as? NSNumber { return alg.intValue }
        return nil
      }
      let finalAlgs = algs.isEmpty ? [-7, -257] : algs
      request.credentialParameters = finalAlgs.map {
        ASAuthorizationPublicKeyCredentialParameters(algorithm: ASCOSEAlgorithmIdentifier($0))
      }

      request.excludedCredentials = excludeDescriptors.compactMap { dict -> ASAuthorizationSecurityKeyPublicKeyCredentialDescriptor? in
        guard let idStr = dict["id"] as? String, let id = fromBase64URL(idStr) else { return nil }
        let transports = (dict["transports"] as? [String])?.toSecurityKeyTransports() ?? [.usb, .nfc, .bluetooth]
        return ASAuthorizationSecurityKeyPublicKeyCredentialDescriptor(credentialID: id, transports: transports)
      }
      requests.append(request)
    }

    guard !requests.isEmpty else {
      promise.reject("INVALID_OPTIONS", "No valid credential request could be constructed")
      return
    }

    perform(
      requests: requests,
      useAutoRegister: (input["useAutoRegister"] as? Bool) ?? false,
      useAutofill: false,
      fallbackCode: "ERR_CREATE_PASSKEY",
      promise: promise
    )
  }

  // MARK: - Assertion

  private func getPasskey(input: [String: Any], promise: Promise) {
    guard let options = input["optionsJSON"] as? [String: Any],
          let rpId = options["rpId"] as? String, !rpId.isEmpty,
          let challengeStr = options["challenge"] as? String,
          let challenge = fromBase64URL(challengeStr) else {
      promise.reject("INVALID_OPTIONS", "Missing or invalid required authentication options")
      return
    }

    let uvPref = (options["userVerification"] as? String)?.toUserVerificationPreference() ?? .preferred
    let allowDescriptors = (options["allowCredentials"] as? [[String: Any]]) ?? []

    // Platform request
    let platformProvider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
    let platformRequest = platformProvider.createCredentialAssertionRequest(challenge: challenge)
    platformRequest.userVerificationPreference = uvPref
    platformRequest.allowedCredentials = allowDescriptors.compactMap { dict -> ASAuthorizationPlatformPublicKeyCredentialDescriptor? in
      guard let idStr = dict["id"] as? String, let id = fromBase64URL(idStr) else { return nil }
      return ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: id)
    }

    // Security Key request
    let securityProvider = ASAuthorizationSecurityKeyPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
    let securityRequest = securityProvider.createCredentialAssertionRequest(challenge: challenge)
    securityRequest.userVerificationPreference = uvPref
    securityRequest.allowedCredentials = allowDescriptors.compactMap { dict -> ASAuthorizationSecurityKeyPublicKeyCredentialDescriptor? in
      guard let idStr = dict["id"] as? String, let id = fromBase64URL(idStr) else { return nil }
      let transports = (dict["transports"] as? [String])?.toSecurityKeyTransports() ?? [.usb, .nfc, .bluetooth]
      return ASAuthorizationSecurityKeyPublicKeyCredentialDescriptor(credentialID: id, transports: transports)
    }

    perform(
      requests: [platformRequest, securityRequest],
      useAutoRegister: false,
      useAutofill: (input["useAutofill"] as? Bool) ?? false,
      fallbackCode: "ERR_GET_PASSKEY",
      promise: promise
    )
  }

  // MARK: - Controller Execution

  private func perform(
    requests: [ASAuthorizationRequest],
    useAutoRegister: Bool,
    useAutofill: Bool,
    fallbackCode: String,
    promise: Promise
  ) {
    let controller = ASAuthorizationController(authorizationRequests: requests)
    let delegate = PasskeyDelegate(
      onSuccess: { promise.resolve($0) },
      onError: { rejectPasskey(promise, fallback: fallbackCode, error: $0) }
    )

    controller.delegate = delegate
    controller.presentationContextProvider = delegate
    delegate.presentationAnchor = presentationAnchor()
    PasskeySessionManager.retain(delegate)

    if useAutofill {
      if #available(iOS 16.0, macOS 13.0, *) {
        controller.performAutoFillAssistedRequests()
      } else {
        controller.performRequests()
      }
    } else if #available(iOS 16.0, macOS 13.0, *), useAutoRegister {
      controller.performRequests(options: .preferImmediatelyAvailableCredentials)
    } else {
      controller.performRequests()
    }
  }

  private func presentationAnchor() -> ASPresentationAnchor? {
    let getAnchor = { () -> ASPresentationAnchor? in
      #if os(iOS)
      if let vc = self.appContext?.utilities?.currentViewController() {
        return vc.view?.window
      }
      return UIApplication.shared.connectedScenes
        .compactMap { $0 as? UIWindowScene }
        .flatMap { $0.windows }
        .first { $0.isKeyWindow }
      #elseif os(macOS)
      return NSApplication.shared.mainWindow ?? NSApplication.shared.windows.first
      #endif
    }
    if Thread.isMainThread { return getAnchor() }
    return DispatchQueue.main.sync { getAnchor() }
  }
}

// MARK: - Delegate

private class PasskeyDelegate: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private var onSuccess: (([String: Any]) -> Void)?
  private var onError: ((Error) -> Void)?
  weak var presentationAnchor: ASPresentationAnchor?

  init(onSuccess: @escaping ([String: Any]) -> Void, onError: @escaping (Error) -> Void) {
    self.onSuccess = onSuccess
    self.onError = onError
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    return presentationAnchor ?? ASPresentationAnchor()
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    if let reg = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration {
      let id = toBase64URL(reg.credentialID)
      onSuccess?([
        "id": id,
        "rawId": id,
        "type": "public-key",
        "authenticatorAttachment": "platform",
        "response": [
          "clientDataJSON": toBase64URL(reg.rawClientDataJSON),
          "attestationObject": toBase64URL(reg.rawAttestationObject ?? Data()),
          "transports": ["internal"],
        ],
        "clientExtensionResults": [:],
      ])
    } else if let reg = authorization.credential as? ASAuthorizationSecurityKeyPublicKeyCredentialRegistration {
      let id = toBase64URL(reg.credentialID)
      onSuccess?([
        "id": id,
        "rawId": id,
        "type": "public-key",
        "authenticatorAttachment": "cross-platform",
        "response": [
          "clientDataJSON": toBase64URL(reg.rawClientDataJSON),
          "attestationObject": toBase64URL(reg.rawAttestationObject ?? Data()),
          "transports": ["usb", "nfc", "ble"],
        ],
        "clientExtensionResults": [:],
      ])
    } else if let asrt = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion {
      let id = toBase64URL(asrt.credentialID)
      var resp: [String: Any] = [
        "clientDataJSON": toBase64URL(asrt.rawClientDataJSON),
        "authenticatorData": toBase64URL(asrt.rawAuthenticatorData ?? Data()),
        "signature": toBase64URL(asrt.signature ?? Data()),
      ]
      if let user = asrt.userID, !user.isEmpty { resp["userHandle"] = toBase64URL(user) }
      onSuccess?([
        "id": id,
        "rawId": id,
        "type": "public-key",
        "authenticatorAttachment": "platform",
        "response": resp,
        "clientExtensionResults": [:],
      ])
    } else if let asrt = authorization.credential as? ASAuthorizationSecurityKeyPublicKeyCredentialAssertion {
      let id = toBase64URL(asrt.credentialID)
      var resp: [String: Any] = [
        "clientDataJSON": toBase64URL(asrt.rawClientDataJSON),
        "authenticatorData": toBase64URL(asrt.rawAuthenticatorData ?? Data()),
        "signature": toBase64URL(asrt.signature ?? Data()),
      ]
      if let user = asrt.userID, !user.isEmpty { resp["userHandle"] = toBase64URL(user) }
      onSuccess?([
        "id": id,
        "rawId": id,
        "type": "public-key",
        "authenticatorAttachment": "cross-platform",
        "response": resp,
        "clientExtensionResults": [:],
      ])
    } else {
      onError?(NSError(domain: "BetterAuthReactNativePasskey", code: -2, userInfo: [NSLocalizedDescriptionKey: "Unsupported credential type"]))
    }
    cleanup()
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    onError?(error)
    cleanup()
  }

  private func cleanup() {
    onSuccess = nil
    onError = nil
    PasskeySessionManager.release(self)
  }
}

// MARK: - Session Retain & Helpers

private enum PasskeySessionManager {
  private static var delegates: [PasskeyDelegate] = []
  static func retain(_ d: PasskeyDelegate) { delegates.append(d) }
  static func release(_ d: PasskeyDelegate) { delegates.removeAll { $0 === d } }
}

private func fromBase64URL(_ str: String) -> Data? {
  var base64 = str.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
  while base64.count % 4 != 0 { base64.append("=") }
  return Data(base64Encoded: base64)
}

private func toBase64URL(_ data: Data) -> String {
  data.base64EncodedString()
    .replacingOccurrences(of: "=", with: "")
    .replacingOccurrences(of: "+", with: "-")
    .replacingOccurrences(of: "/", with: "_")
}

private func rejectPasskey(_ promise: Promise, fallback: String, error: Error) {
  if let authError = error as? ASAuthorizationError {
    switch authError.code {
    case .canceled:
      promise.reject("ERROR_CEREMONY_ABORTED", authError.localizedDescription)
    case .failed:
      promise.reject("ERR_FAILED", authError.localizedDescription)
    default:
      promise.reject(fallback, authError.localizedDescription)
    }
  } else {
    promise.reject(fallback, error.localizedDescription)
  }
}

private extension String {
  func toUserVerificationPreference() -> ASAuthorizationPublicKeyCredentialUserVerificationPreference {
    switch self.lowercased() {
    case "required": return .required
    case "discouraged": return .discouraged
    default: return .preferred
    }
  }

  func toAttestationPreference() -> ASAuthorizationPublicKeyCredentialAttestationKind {
    switch self.lowercased() {
    case "direct": return .direct
    case "indirect": return .indirect
    case "enterprise": return .enterprise
    default: return .none
    }
  }
}

private extension Dictionary where Key == String, Value == Any {
  func toResidentKeyPreference() -> ASAuthorizationPublicKeyCredentialResidentKeyPreference {
    if let rk = (self["residentKey"] as? String)?.lowercased() {
      switch rk {
      case "required": return .required
      case "discouraged": return .discouraged
      default: return .preferred
      }
    }
    if self["requireResidentKey"] as? Bool == true {
      return .required
    }
    return .preferred
  }
}

private extension Array where Element == String {
  func toSecurityKeyTransports() -> [ASAuthorizationSecurityKeyPublicKeyCredentialDescriptor.Transport] {
    let mapped: [ASAuthorizationSecurityKeyPublicKeyCredentialDescriptor.Transport] = compactMap { transport in
      switch transport.lowercased() {
      case "usb": return .usb
      case "nfc": return .nfc
      case "ble", "bluetooth": return .bluetooth
      default: return nil
      }
    }
    return mapped.isEmpty ? [.usb, .nfc, .bluetooth] : mapped
  }
}
