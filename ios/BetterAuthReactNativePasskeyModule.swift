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
      self.handleCreatePasskey(input: input, promise: promise)
    }

    AsyncFunction("authenticatePasskey") { (input: [String: Any], promise: Promise) in
      self.handleGetPasskey(input: input, promise: promise)
    }
  }
}

extension BetterAuthReactNativePasskeyModule {
  fileprivate func handleCreatePasskey(input: [String: Any], promise: Promise) {
    do {
      guard let options = input["optionsJSON"] as? [String: Any] else {
        throw PasskeyParseError.missing("optionsJSON")
      }
      let creation = try PublicKeyCredentialCreationOptionsJSONLite(dict: options)
      guard let challenge = Self.fromBase64URL(creation.challenge) else {
        throw PasskeyParseError.invalidBase64URL("challenge")
      }
      guard let userId = Self.fromBase64URL(creation.user.id) else {
        throw PasskeyParseError.invalidBase64URL("user.id")
      }

      let passkeyName = creation.user.name.isEmpty ? creation.user.displayName : creation.user.name
      let attachment = creation.authenticatorSelection?.authenticatorAttachment?.lowercased()
      var requests: [ASAuthorizationRequest] = []

      if attachment != "cross-platform" {
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
          relyingPartyIdentifier: creation.rp.id
        )
        let request = provider.createCredentialRegistrationRequest(
          challenge: challenge,
          name: passkeyName,
          userID: userId
        )
        let descriptors = try creation.excludeCredentials.map { cred -> ASAuthorizationPlatformPublicKeyCredentialDescriptor in
          guard let id = Self.fromBase64URL(cred.id) else {
            throw PasskeyParseError.invalidBase64URL("excludeCredentials.id")
          }
          return ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: id)
        }
        if #available(iOS 17.4, macOS 14.4, *) {
          request.excludedCredentials = descriptors
        }
        if let uvPref = creation.authenticatorSelection?.userVerification {
          request.userVerificationPreference = uvPref.toASUserVerificationPreference()
        }
        if let attestation = creation.attestation {
          request.attestationPreference = attestation.toASAttestationPreference()
        }
        requests.append(request)
      }

      if attachment != "platform" {
        let provider = ASAuthorizationSecurityKeyPublicKeyCredentialProvider(
          relyingPartyIdentifier: creation.rp.id
        )
        let request = provider.createCredentialRegistrationRequest(
          challenge: challenge,
          displayName: creation.user.displayName,
          name: passkeyName,
          userID: userId
        )
        let params = creation.pubKeyCredParams.isEmpty
          ? [PKCPubKeyCredParam(alg: -7), PKCPubKeyCredParam(alg: -257)]
          : creation.pubKeyCredParams
        request.credentialParameters = params.map {
          ASAuthorizationPublicKeyCredentialParameters(algorithm: ASCOSEAlgorithmIdentifier($0.alg))
        }
        request.excludedCredentials = try creation.excludeCredentials.map { cred -> ASAuthorizationSecurityKeyPublicKeyCredentialDescriptor in
          guard let id = Self.fromBase64URL(cred.id) else {
            throw PasskeyParseError.invalidBase64URL("excludeCredentials.id")
          }
          return ASAuthorizationSecurityKeyPublicKeyCredentialDescriptor(
            credentialID: id,
            transports: cred.transports.toSecurityKeyTransports()
          )
        }
        if let uvPref = creation.authenticatorSelection?.userVerification {
          request.userVerificationPreference = uvPref.toASUserVerificationPreference()
        }
        request.residentKeyPreference = creation.authenticatorSelection.toResidentKeyPreference()
        if let attestation = creation.attestation {
          request.attestationPreference = attestation.toASAttestationPreference()
        }
        requests.append(request)
      }

      guard !requests.isEmpty else {
        throw PasskeyParseError.missing("authenticatorSelection.authenticatorAttachment")
      }

      let delegate = PasskeyDelegate()
      delegate.onResult = { result in
        promise.resolve(result)
      }
      delegate.onError = { error in
        Self.reject(promise, fallbackCode: "ERR_CREATE_PASSKEY", error: error)
      }

      Self.perform(
        requests: requests,
        delegate: delegate,
        appContext: self.appContext,
        useAutoRegister: (input["useAutoRegister"] as? Bool) ?? false,
        useAutofill: false
      )
    } catch {
      Self.reject(promise, fallbackCode: "INVALID_OPTIONS", error: error)
    }
  }

  fileprivate func handleGetPasskey(input: [String: Any], promise: Promise) {
    do {
      guard let options = input["optionsJSON"] as? [String: Any] else {
        throw PasskeyParseError.missing("optionsJSON")
      }
      let req = try PublicKeyCredentialRequestOptionsJSONLite(dict: options)
      guard let challenge = Self.fromBase64URL(req.challenge) else {
        throw PasskeyParseError.invalidBase64URL("challenge")
      }

      let platformProvider = ASAuthorizationPlatformPublicKeyCredentialProvider(
        relyingPartyIdentifier: req.rpId
      )
      let platformRequest = platformProvider.createCredentialAssertionRequest(challenge: challenge)
      platformRequest.allowedCredentials = try req.allowCredentials.map { cred -> ASAuthorizationPlatformPublicKeyCredentialDescriptor in
        guard let id = Self.fromBase64URL(cred.id) else {
          throw PasskeyParseError.invalidBase64URL("allowCredentials.id")
        }
        return ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: id)
      }
      if let uv = req.userVerification {
        platformRequest.userVerificationPreference = uv.toASUserVerificationPreference()
      }

      let securityProvider = ASAuthorizationSecurityKeyPublicKeyCredentialProvider(
        relyingPartyIdentifier: req.rpId
      )
      let securityRequest = securityProvider.createCredentialAssertionRequest(challenge: challenge)
      securityRequest.allowedCredentials = try req.allowCredentials.map { cred -> ASAuthorizationSecurityKeyPublicKeyCredentialDescriptor in
        guard let id = Self.fromBase64URL(cred.id) else {
          throw PasskeyParseError.invalidBase64URL("allowCredentials.id")
        }
        return ASAuthorizationSecurityKeyPublicKeyCredentialDescriptor(
          credentialID: id,
          transports: cred.transports.toSecurityKeyTransports()
        )
      }
      if let uv = req.userVerification {
        securityRequest.userVerificationPreference = uv.toASUserVerificationPreference()
      }

      let delegate = PasskeyDelegate()
      delegate.onResult = { result in
        promise.resolve(result)
      }
      delegate.onError = { error in
        Self.reject(promise, fallbackCode: "ERR_GET_PASSKEY", error: error)
      }

      Self.perform(
        requests: [platformRequest, securityRequest],
        delegate: delegate,
        appContext: self.appContext,
        useAutoRegister: false,
        useAutofill: (input["useAutofill"] as? Bool) ?? false
      )
    } catch {
      Self.reject(promise, fallbackCode: "INVALID_OPTIONS", error: error)
    }
  }
}

private class PasskeyDelegate: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  var onResult: (([String: Any]) -> Void)?
  var onError: ((Error) -> Void)?
  weak var presentationAnchor: ASPresentationAnchor?

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    return presentationAnchor ?? ASPresentationAnchor()
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    if let reg = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration {
      onResult?(BetterAuthReactNativePasskeyModule.registrationDictionary(
        credentialID: reg.credentialID,
        rawClientDataJSON: reg.rawClientDataJSON,
        rawAttestationObject: reg.rawAttestationObject,
        authenticatorAttachment: "platform",
        transports: ["internal"]
      ))
    } else if let reg = authorization.credential as? ASAuthorizationSecurityKeyPublicKeyCredentialRegistration {
      onResult?(BetterAuthReactNativePasskeyModule.registrationDictionary(
        credentialID: reg.credentialID,
        rawClientDataJSON: reg.rawClientDataJSON,
        rawAttestationObject: reg.rawAttestationObject,
        authenticatorAttachment: "cross-platform",
        transports: ["usb", "nfc", "ble"]
      ))
    } else if let asrt = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion {
      onResult?(BetterAuthReactNativePasskeyModule.authenticationDictionary(
        credentialID: asrt.credentialID,
        rawClientDataJSON: asrt.rawClientDataJSON,
        rawAuthenticatorData: asrt.rawAuthenticatorData,
        signature: asrt.signature,
        userID: asrt.userID,
        authenticatorAttachment: "platform"
      ))
    } else if let asrt = authorization.credential as? ASAuthorizationSecurityKeyPublicKeyCredentialAssertion {
      onResult?(BetterAuthReactNativePasskeyModule.authenticationDictionary(
        credentialID: asrt.credentialID,
        rawClientDataJSON: asrt.rawClientDataJSON,
        rawAuthenticatorData: asrt.rawAuthenticatorData,
        signature: asrt.signature,
        userID: asrt.userID,
        authenticatorAttachment: "cross-platform"
      ))
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
    onResult = nil
    onError = nil
    BetterAuthReactNativePasskeyModule.release(self)
  }
}

extension BetterAuthReactNativePasskeyModule {
  static func fromBase64URL(_ str: String) -> Data? {
    let base64 = str
      .replacingOccurrences(of: "-", with: "+")
      .replacingOccurrences(of: "_", with: "/")
      .padding(toLength: ((str.count + 3) / 4) * 4, withPad: "=", startingAt: 0)
    return Data(base64Encoded: base64)
  }

  static func toBase64URL(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "=", with: "")
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
  }

  static func presentationAnchor(appContext: AppContext?) -> ASPresentationAnchor? {
    var result: ASPresentationAnchor?
    let work = {
      #if os(iOS)
      if let vc = appContext?.utilities?.currentViewController() {
        result = vc.view?.window
      } else {
        result = UIApplication.shared.connectedScenes
          .compactMap { $0 as? UIWindowScene }
          .flatMap { $0.windows }
          .first { $0.isKeyWindow }
      }
      #elseif os(macOS)
      result = NSApplication.shared.mainWindow ?? NSApplication.shared.windows.first
      #endif
    }
    if Thread.isMainThread {
      work()
    } else {
      DispatchQueue.main.sync { work() }
    }
    return result
  }

  fileprivate static func perform(
    requests: [ASAuthorizationRequest],
    delegate: PasskeyDelegate,
    appContext: AppContext?,
    useAutoRegister: Bool,
    useAutofill: Bool
  ) {
    let controller = ASAuthorizationController(authorizationRequests: requests)
    controller.delegate = delegate
    controller.presentationContextProvider = delegate
    delegate.presentationAnchor = presentationAnchor(appContext: appContext)
    retain(delegate)

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

  fileprivate static func registrationDictionary(
    credentialID: Data,
    rawClientDataJSON: Data,
    rawAttestationObject: Data?,
    authenticatorAttachment: String,
    transports: [String]
  ) -> [String: Any] {
    let id = toBase64URL(credentialID)
    let response = RegistrationResponseJSONLite.ResponseFields(
      clientDataJSON: toBase64URL(rawClientDataJSON),
      attestationObject: toBase64URL(rawAttestationObject ?? Data()),
      transports: transports
    )
    return RegistrationResponseJSONLite(
      id: id,
      rawId: id,
      type: "public-key",
      response: response,
      authenticatorAttachment: authenticatorAttachment,
      clientExtensionResults: [:]
    ).toDictionary()
  }

  fileprivate static func authenticationDictionary(
    credentialID: Data,
    rawClientDataJSON: Data,
    rawAuthenticatorData: Data?,
    signature: Data?,
    userID: Data?,
    authenticatorAttachment: String
  ) -> [String: Any] {
    let id = toBase64URL(credentialID)
    let userHandle = (userID?.isEmpty == false) ? toBase64URL(userID!) : nil
    let response = AuthenticationResponseJSONLite.ResponseFields(
      clientDataJSON: toBase64URL(rawClientDataJSON),
      authenticatorData: toBase64URL(rawAuthenticatorData ?? Data()),
      signature: toBase64URL(signature ?? Data()),
      userHandle: userHandle
    )
    return AuthenticationResponseJSONLite(
      id: id,
      rawId: id,
      type: "public-key",
      response: response,
      authenticatorAttachment: authenticatorAttachment,
      clientExtensionResults: [:]
    ).toDictionary()
  }

  static func reject(_ promise: Promise, fallbackCode: String, error: Error) {
    if let parseError = error as? PasskeyParseError {
      promise.reject("INVALID_OPTIONS", parseError.localizedDescription)
      return
    }
    if let authError = error as? ASAuthorizationError {
      switch authError.code {
      case .canceled:
        promise.reject("ERROR_CEREMONY_ABORTED", authError.localizedDescription)
      case .failed:
        promise.reject("ERR_FAILED", authError.localizedDescription)
      default:
        promise.reject(fallbackCode, authError.localizedDescription)
      }
      return
    }
    promise.reject(fallbackCode, error.localizedDescription)
  }

  private static var retainedDelegates: [PasskeyDelegate] = []
  fileprivate static func retain(_ d: PasskeyDelegate) { retainedDelegates.append(d) }
  fileprivate static func release(_ d: PasskeyDelegate) { retainedDelegates.removeAll { $0 === d } }
}

private extension String {
  func toASUserVerificationPreference() -> ASAuthorizationPublicKeyCredentialUserVerificationPreference {
    switch self.lowercased() {
    case "required": return .required
    case "discouraged": return .discouraged
    default: return .preferred
    }
  }

  func toASAttestationPreference() -> ASAuthorizationPublicKeyCredentialAttestationKind {
    switch self.lowercased() {
    case "direct": return .direct
    case "indirect": return .indirect
    case "enterprise": return .enterprise
    default: return .none
    }
  }
}

private extension Optional where Wrapped == PKCAuthenticatorSelection {
  func toResidentKeyPreference() -> ASAuthorizationPublicKeyCredentialResidentKeyPreference {
    guard let selection = self else { return .preferred }
    if let residentKey = selection.residentKey?.lowercased() {
      switch residentKey {
      case "required": return .required
      case "discouraged": return .discouraged
      default: return .preferred
      }
    }
    if selection.requireResidentKey == true {
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

private extension PKCPubKeyCredParam {
  init(alg: Int) {
    self.alg = alg
  }
}
