import ExpoModulesCore
import AuthenticationServices

#if os(iOS)
import UIKit
#else
import AppKit
#endif

public class BetterAuthReactNativePasskeyModule: Module {
  // Everything below runs on the main queue, which is also where
  // AuthenticationServices calls the delegate.

  // ASAuthorizationController holds its delegate weakly, so in-flight
  // delegates live here until they settle.
  private var activeDelegates: [PasskeyDelegate] = []
  // The live AutoFill-assisted request, if any.
  private var pendingAutoFill: (controller: ASAuthorizationController, delegate: PasskeyDelegate)?

  public func definition() -> ModuleDefinition {
    Name("BetterAuthReactNativePasskey")

    AsyncFunction("registerPasskey") { (input: [String: Any], promise: Promise) in
      self.createPasskey(input: input, promise: promise)
    }.runOnQueue(.main)

    AsyncFunction("authenticatePasskey") { (input: [String: Any], promise: Promise) in
      self.getPasskey(input: input, promise: promise)
    }.runOnQueue(.main)

    AsyncFunction("cancelPasskeyAutoFill") {
      self.cancelPendingAutoFill()
    }.runOnQueue(.main)
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
    let excluded = credentialDescriptors(options["excludeCredentials"])
    var requests: [ASAuthorizationRequest] = []

    // Platform authenticator (Face ID / Touch ID / iCloud Keychain)
    if attachment != "cross-platform" {
      let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
      let request = provider.createCredentialRegistrationRequest(challenge: challenge, name: passkeyName, userID: userId)
      request.userVerificationPreference = uvPref
      request.attestationPreference = attestationPref
      if #available(iOS 17.4, macOS 14.4, *) {
        request.excludedCredentials = excluded.map(\.platform)
      }
      requests.append(request)
    }

    // Security key (FIDO2 USB / NFC / BLE)
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

      let algs = ((options["pubKeyCredParams"] as? [[String: Any]]) ?? []).compactMap {
        ($0["alg"] as? NSNumber)?.intValue
      }
      request.credentialParameters = (algs.isEmpty ? [-7, -257] : algs).map {
        ASAuthorizationPublicKeyCredentialParameters(algorithm: ASCOSEAlgorithmIdentifier($0))
      }
      request.excludedCredentials = excluded.map(\.securityKey)
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
    let allowed = credentialDescriptors(options["allowCredentials"])

    let platformRequest = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
      .createCredentialAssertionRequest(challenge: challenge)
    platformRequest.userVerificationPreference = uvPref
    platformRequest.allowedCredentials = allowed.map(\.platform)

    let securityRequest = ASAuthorizationSecurityKeyPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
      .createCredentialAssertionRequest(challenge: challenge)
    securityRequest.userVerificationPreference = uvPref
    securityRequest.allowedCredentials = allowed.map(\.securityKey)

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
      anchor: presentationAnchor(),
      onSuccess: { promise.resolve($0) },
      onError: { rejectPasskey(promise, fallback: fallbackCode, error: $0) },
      onFinish: { [weak self] finished in
        guard let self = self else { return }
        self.activeDelegates.removeAll { $0 === finished }
        if self.pendingAutoFill?.delegate === finished {
          self.pendingAutoFill = nil
        }
      }
    )
    controller.delegate = delegate
    controller.presentationContextProvider = delegate
    activeDelegates.append(delegate)

    #if os(iOS)
    if useAutofill, #available(iOS 16.0, *) {
      // At most one assisted controller may compete for the QuickType bar.
      cancelPendingAutoFill()
      pendingAutoFill = (controller, delegate)
      controller.performAutoFillAssistedRequests()
      return
    }
    #endif
    // AutoFill-assisted requests don't exist on macOS or before iOS 16, so
    // `useAutofill` falls back to a modal request there.
    if #available(iOS 16.0, macOS 13.0, *), useAutoRegister {
      controller.performRequests(options: .preferImmediatelyAvailableCredentials)
    } else {
      controller.performRequests()
    }
  }

  /// Rejects the pending AutoFill-assisted request with ERROR_CEREMONY_ABORTED
  /// and cancels its controller. Modal requests are never tracked here.
  private func cancelPendingAutoFill() {
    guard let pending = pendingAutoFill else { return }
    pendingAutoFill = nil
    // Settle first: whether cancel() calls the delegate for an assisted
    // controller is undocumented, and a late callback must be a no-op.
    pending.delegate.abort(ASAuthorizationError(
      .canceled,
      userInfo: [NSLocalizedDescriptionKey: "AutoFill passkey request was cancelled"]
    ))
    if #available(iOS 16.0, macOS 13.0, *) {
      pending.controller.cancel()
    }
  }

  private func presentationAnchor() -> ASPresentationAnchor? {
    #if os(iOS)
    if let vc = appContext?.utilities?.currentViewController() {
      return vc.view?.window
    }
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
    #else
    return NSApplication.shared.mainWindow ?? NSApplication.shared.windows.first
    #endif
  }
}

// MARK: - Delegate

private class PasskeyDelegate: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private weak var anchor: ASPresentationAnchor?
  private var onSuccess: (([String: Any]) -> Void)?
  private var onError: ((Error) -> Void)?
  private var onFinish: ((PasskeyDelegate) -> Void)?

  init(
    anchor: ASPresentationAnchor?,
    onSuccess: @escaping ([String: Any]) -> Void,
    onError: @escaping (Error) -> Void,
    onFinish: @escaping (PasskeyDelegate) -> Void
  ) {
    self.anchor = anchor
    self.onSuccess = onSuccess
    self.onError = onError
    self.onFinish = onFinish
  }

  /// Settles the request without waiting for AuthenticationServices.
  func abort(_ error: Error) {
    onError?(error)
    finish()
  }

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    return anchor ?? ASPresentationAnchor()
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    if let json = publicKeyCredentialJSON(authorization.credential) {
      onSuccess?(json)
    } else {
      onError?(NSError(domain: "BetterAuthReactNativePasskey", code: -2, userInfo: [NSLocalizedDescriptionKey: "Unsupported credential type"]))
    }
    finish()
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    onError?(error)
    finish()
  }

  private func finish() {
    let onFinish = self.onFinish
    onSuccess = nil
    onError = nil
    self.onFinish = nil
    onFinish?(self)
  }
}

// MARK: - Helpers

/// Serializes a credential as a SimpleWebAuthn RegistrationResponseJSON or
/// AuthenticationResponseJSON.
private func publicKeyCredentialJSON(_ credential: ASAuthorizationCredential) -> [String: Any]? {
  let attachment: String
  switch credential {
  case is ASAuthorizationPlatformPublicKeyCredentialRegistration,
       is ASAuthorizationPlatformPublicKeyCredentialAssertion:
    attachment = "platform"
  case is ASAuthorizationSecurityKeyPublicKeyCredentialRegistration,
       is ASAuthorizationSecurityKeyPublicKeyCredentialAssertion:
    attachment = "cross-platform"
  default:
    return nil
  }

  let response: [String: Any]
  let credentialID: Data
  if let registration = credential as? ASAuthorizationPublicKeyCredentialRegistration {
    credentialID = registration.credentialID
    response = [
      "clientDataJSON": toBase64URL(registration.rawClientDataJSON),
      "attestationObject": toBase64URL(registration.rawAttestationObject ?? Data()),
      "transports": attachment == "platform" ? ["internal"] : ["usb", "nfc", "ble"],
    ]
  } else if let assertion = credential as? ASAuthorizationPublicKeyCredentialAssertion {
    credentialID = assertion.credentialID
    var assertionResponse: [String: Any] = [
      "clientDataJSON": toBase64URL(assertion.rawClientDataJSON),
      "authenticatorData": toBase64URL(assertion.rawAuthenticatorData ?? Data()),
      "signature": toBase64URL(assertion.signature ?? Data()),
    ]
    if let userID = assertion.userID, !userID.isEmpty {
      assertionResponse["userHandle"] = toBase64URL(userID)
    }
    response = assertionResponse
  } else {
    return nil
  }

  let id = toBase64URL(credentialID)
  return [
    "id": id,
    "rawId": id,
    "type": "public-key",
    "authenticatorAttachment": attachment,
    "response": response,
    "clientExtensionResults": [:],
  ]
}

/// A `PublicKeyCredentialDescriptorJSON` from `allowCredentials` or `excludeCredentials`.
private struct CredentialDescriptor {
  let id: Data
  let transports: [String]

  init?(_ json: [String: Any]) {
    guard let idStr = json["id"] as? String, let id = fromBase64URL(idStr) else { return nil }
    self.id = id
    self.transports = (json["transports"] as? [String]) ?? []
  }

  var platform: ASAuthorizationPlatformPublicKeyCredentialDescriptor {
    ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: id)
  }

  var securityKey: ASAuthorizationSecurityKeyPublicKeyCredentialDescriptor {
    ASAuthorizationSecurityKeyPublicKeyCredentialDescriptor(credentialID: id, transports: transports.toSecurityKeyTransports())
  }
}

private func credentialDescriptors(_ json: Any?) -> [CredentialDescriptor] {
  ((json as? [[String: Any]]) ?? []).compactMap(CredentialDescriptor.init)
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
    switch lowercased() {
    case "required": return .required
    case "discouraged": return .discouraged
    default: return .preferred
    }
  }

  func toAttestationPreference() -> ASAuthorizationPublicKeyCredentialAttestationKind {
    switch lowercased() {
    case "direct": return .direct
    case "indirect": return .indirect
    case "enterprise": return .enterprise
    default: return .none
    }
  }
}

private extension Dictionary where Key == String, Value == Any {
  func toResidentKeyPreference() -> ASAuthorizationPublicKeyCredentialResidentKeyPreference {
    switch (self["residentKey"] as? String)?.lowercased() {
    case "required": return .required
    case "discouraged": return .discouraged
    case .some: return .preferred
    case .none: return self["requireResidentKey"] as? Bool == true ? .required : .preferred
    }
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
