import ExpoModulesCore
import AuthenticationServices

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

public class BetterAuthReactNativePasskeyModule: Module {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('BetterAuthReactNativePasskey')` in JavaScript.
    Name("BetterAuthReactNativePasskey")

    // Native passkey creation using ASAuthorizationController
    // Supports only the wrapped shape from TypeScript: { optionsJSON, useAutoRegister? }
    AsyncFunction("registerPasskey") { (input: [String: Any], promise: Promise) in
      self.handleCreatePasskey(input: input, promise: promise)
    }

    // Native passkey authentication using ASAuthorizationController
    // Supports only the wrapped shape from TypeScript: { optionsJSON, useAutofill? }
    AsyncFunction("authenticatePasskey") { (input: [String: Any], promise: Promise) in
      self.handleGetPasskey(input: input, promise: promise)
    }
  }
}

// MARK: - Helpers

extension BetterAuthReactNativePasskeyModule {
  fileprivate func handleCreatePasskey(input: [String: Any], promise: Promise) {
    // Input must be @simplewebauthn/types PublicKeyCredentialCreationOptionsJSON
    let options = input["optionsJSON"] as! [String: Any]
    let creation = PublicKeyCredentialCreationOptionsJSONLite(dict: options)

    let challenge = BetterAuthReactNativePasskeyModule.fromBase64URL(creation.challenge)!
    let userId = BetterAuthReactNativePasskeyModule.fromBase64URL(creation.user.id)!

    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: creation.rp.id)
    let passkeyName = creation.user.name.isEmpty ? creation.user.displayName : creation.user.name
    let request = provider.createCredentialRegistrationRequest(challenge: challenge, name: passkeyName, userID: userId)

    // Exclusions
    let descriptors: [ASAuthorizationPlatformPublicKeyCredentialDescriptor] = creation.excludeCredentials.map { cred in
      let id = BetterAuthReactNativePasskeyModule.fromBase64URL(cred.id)!
      return ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: id)
    }
    if #available(iOS 17.4, *) {
      request.excludedCredentials = descriptors
    }

    // User verification preference (optional)
    if let uvPref = creation.authenticatorSelection?.userVerification {
      request.userVerificationPreference = uvPref.toASUserVerificationPreference()
    }

    let delegate = PasskeyDelegate()
    delegate.onRegistration = { reg in
      let id = BetterAuthReactNativePasskeyModule.toBase64URL(reg.credentialID)
      let response = RegistrationResponseJSONLite.ResponseFields(
        clientDataJSON: BetterAuthReactNativePasskeyModule.toBase64URL(reg.rawClientDataJSON),
        attestationObject: BetterAuthReactNativePasskeyModule.toBase64URL(reg.rawAttestationObject ?? Data()),
        transports: ["internal"]
      )
      let result = RegistrationResponseJSONLite(
        id: id,
        rawId: id,
        type: "public-key",
        response: response,
        authenticatorAttachment: "platform",
        clientExtensionResults: [:]
      )
      promise.resolve(result.toDictionary())
    }
    delegate.onError = { error in
      promise.reject("ERR_CREATE_PASSKEY", error.localizedDescription)
    }

    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = delegate
    controller.presentationContextProvider = delegate
    delegate.presentationAnchor = BetterAuthReactNativePasskeyModule.presentationAnchor(appContext: self.appContext)

    // Optional hint for auto register, when supported
    let useAutoRegister = (input["useAutoRegister"] as? Bool) ?? false
    if #available(iOS 16.0, macOS 13.0, *) {
      var options: ASAuthorizationController.RequestOptions = []
      if useAutoRegister {
        options.insert(.preferImmediatelyAvailableCredentials)
      }
      controller.performRequests(options: options)
    } else {
      controller.performRequests()
    }

    BetterAuthReactNativePasskeyModule.retain(delegate)
  }

  fileprivate func handleGetPasskey(input: [String: Any], promise: Promise) {
    // Only support wrapped shape from TS bridge
    let options = input["optionsJSON"] as! [String: Any]
    let req = PublicKeyCredentialRequestOptionsJSONLite(dict: options)
    let challenge = BetterAuthReactNativePasskeyModule.fromBase64URL(req.challenge)!

    let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: req.rpId)
    let request = provider.createCredentialAssertionRequest(challenge: challenge)

    // Allow list
    let descriptors: [ASAuthorizationPlatformPublicKeyCredentialDescriptor] = req.allowCredentials.map { cred in
      let id = BetterAuthReactNativePasskeyModule.fromBase64URL(cred.id)!
      return ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: id)
    }
    request.allowedCredentials = descriptors

    // User verification preference
    if let uv = req.userVerification {
      request.userVerificationPreference = uv.toASUserVerificationPreference()
    }

    let delegate = PasskeyDelegate()
    delegate.onAssertion = { asrt in
      let id = BetterAuthReactNativePasskeyModule.toBase64URL(asrt.credentialID)
      let userHandle = (asrt.userID?.isEmpty == false) ? BetterAuthReactNativePasskeyModule.toBase64URL(asrt.userID!) : nil
      let response = AuthenticationResponseJSONLite.ResponseFields(
        clientDataJSON: BetterAuthReactNativePasskeyModule.toBase64URL(asrt.rawClientDataJSON),
        authenticatorData: BetterAuthReactNativePasskeyModule.toBase64URL(asrt.rawAuthenticatorData),
        signature: BetterAuthReactNativePasskeyModule.toBase64URL(asrt.signature),
        userHandle: userHandle
      )
      let result = AuthenticationResponseJSONLite(
        id: id,
        rawId: id,
        type: "public-key",
        response: response,
        authenticatorAttachment: "platform",
        clientExtensionResults: [:]
      )
      promise.resolve(result.toDictionary())
    }
    delegate.onError = { error in
      promise.reject("ERR_GET_PASSKEY", error.localizedDescription)
    }

    let controller = ASAuthorizationController(authorizationRequests: [request])
    controller.delegate = delegate
    controller.presentationContextProvider = delegate
    delegate.presentationAnchor = BetterAuthReactNativePasskeyModule.presentationAnchor(appContext: self.appContext)

    let useAutofill = (input["useAutofill"] as? Bool) ?? false
    if #available(iOS 16.0, macOS 13.0, *) {
      var options: ASAuthorizationController.RequestOptions = []
      if useAutofill {
        options.insert(.preferImmediatelyAvailableCredentials)
      }
      controller.performRequests(options: options)
    } else {
      controller.performRequests()
    }

    BetterAuthReactNativePasskeyModule.retain(delegate)
  }
}

private class PasskeyDelegate: NSObject, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  var onRegistration: ((ASAuthorizationPlatformPublicKeyCredentialRegistration) -> Void)?
  var onAssertion: ((ASAuthorizationPlatformPublicKeyCredentialAssertion) -> Void)?
  var onError: ((Error) -> Void)?
  weak var presentationAnchor: ASPresentationAnchor?

  func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    return presentationAnchor ?? ASPresentationAnchor()
  }

  func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    if let reg = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration {
      onRegistration?(reg)
    } else if let asrt = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion {
      onAssertion?(asrt)
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
    onRegistration = nil
    onAssertion = nil
    onError = nil
    BetterAuthReactNativePasskeyModule.release(self)
  }
}

// MARK: - Base64URL helpers for WebAuthn JSON format
extension BetterAuthReactNativePasskeyModule {
  // WebAuthn uses base64url encoding (no padding, URL-safe characters)
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
    #if os(iOS)
    if let vc = appContext?.utilities?.currentViewController() {
      return vc.view?.window
    }
    return UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
    #elseif os(macOS)
    // For macOS, return the main window
    return NSApplication.shared.mainWindow ?? NSApplication.shared.windows.first
    #endif
  }

  // Keep delegates alive while ASAuthorizationController is operating
  private static var retainedDelegates: [PasskeyDelegate] = []
  fileprivate static func retain(_ d: PasskeyDelegate) { retainedDelegates.append(d) }
  fileprivate static func release(_ d: PasskeyDelegate) { retainedDelegates.removeAll { $0 === d } }
}

// MARK: - String helpers
private extension String {
  func toASUserVerificationPreference() -> ASAuthorizationPublicKeyCredentialUserVerificationPreference {
    switch self.lowercased() {
    case "required": return .required
    case "discouraged": return .discouraged
    default: return .preferred
    }
  }
}
