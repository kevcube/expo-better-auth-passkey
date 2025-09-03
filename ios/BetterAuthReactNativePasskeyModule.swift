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
    AsyncFunction("createPasskey") { (options: [String: Any], promise: Promise) in
      guard
        let rp = options["rp"] as? [String: Any],
        let rpId = rp["id"] as? String ?? rp["name"] as? String,
        let challengeB64 = options["challenge"] as? String,
        let user = options["user"] as? [String: Any],
        let userIdB64 = user["id"] as? String
      else {
        promise.reject("ERR_INVALID_OPTIONS", "Missing rp.id, challenge, or user.id")
        return
      }

      guard
        let challenge = BetterAuthReactNativePasskeyModule.fromBase64URL(challengeB64),
        let userId = BetterAuthReactNativePasskeyModule.fromBase64URL(userIdB64)
      else {
        promise.reject("ERR_INVALID_OPTIONS", "Failed to decode challenge or user.id")
        return
      }

        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
      let name = (user["name"] as? String) ?? (user["displayName"] as? String) ?? ""
      let request = provider.createCredentialRegistrationRequest(challenge: challenge, name: name, userID: userId)

      let delegate = PasskeyDelegate()
      delegate.onRegistration = { reg in
        let id = BetterAuthReactNativePasskeyModule.toBase64URL(reg.credentialID)

        var response: [String: Any] = [
          "clientDataJSON": BetterAuthReactNativePasskeyModule.toBase64URL(reg.rawClientDataJSON),
          "attestationObject": BetterAuthReactNativePasskeyModule.toBase64URL(reg.rawAttestationObject ?? Data()),
          "transports": ["internal"]  // iOS always uses internal transport
        ]

        let result: [String: Any] = [
          "id": id,
          "rawId": id,
          "type": "public-key",
          "response": response,
        ]
        promise.resolve(result)
      }
      delegate.onError = { error in
        promise.reject("ERR_CREATE_PASSKEY", error.localizedDescription)
      }

      let controller = ASAuthorizationController(authorizationRequests: [request])
      controller.delegate = delegate
      controller.presentationContextProvider = delegate
      delegate.presentationAnchor = BetterAuthReactNativePasskeyModule.presentationAnchor(appContext: self.appContext)
      controller.performRequests()
      BetterAuthReactNativePasskeyModule.retain(delegate)
    }

    // Native passkey authentication using ASAuthorizationController
    AsyncFunction("getPasskey") { (options: [String: Any], promise: Promise) in
      guard
        let rpId = options["rpId"] as? String,
        let challengeB64 = options["challenge"] as? String,
        let challenge = BetterAuthReactNativePasskeyModule.fromBase64URL(challengeB64)
      else {
        promise.reject("ERR_INVALID_OPTIONS", "Missing rpId or challenge")
        return
      }

      let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
      let request = provider.createCredentialAssertionRequest(challenge: challenge)

      if let allowCredentials = options["allowCredentials"] as? [[String: Any]] {
        let descriptors: [ASAuthorizationPlatformPublicKeyCredentialDescriptor] = allowCredentials.compactMap { cred in
          guard let idB64 = cred["id"] as? String, let id = BetterAuthReactNativePasskeyModule.fromBase64URL(idB64) else { return nil }
          return ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: id)
        }
        if !descriptors.isEmpty {
          request.allowedCredentials = descriptors
        }
      }

      let delegate = PasskeyDelegate()
      delegate.onAssertion = { asrt in
        let id = BetterAuthReactNativePasskeyModule.toBase64URL(asrt.credentialID)
        let userHandle = (asrt.userID?.isEmpty == false) ? BetterAuthReactNativePasskeyModule.toBase64URL(asrt.userID!) : nil
        let result: [String: Any] = [
          "id": id,
          "rawId": id,
          "type": "public-key",
          "response": [
            "clientDataJSON": BetterAuthReactNativePasskeyModule.toBase64URL(asrt.rawClientDataJSON),
            "authenticatorData": BetterAuthReactNativePasskeyModule.toBase64URL(asrt.rawAuthenticatorData),
            "signature": BetterAuthReactNativePasskeyModule.toBase64URL(asrt.signature),
            "userHandle": userHandle as Any,
          ],
        ]
        promise.resolve(result)
      }
      delegate.onError = { error in
        promise.reject("ERR_GET_PASSKEY", error.localizedDescription)
      }

      let controller = ASAuthorizationController(authorizationRequests: [request])
      controller.delegate = delegate
      controller.presentationContextProvider = delegate
      delegate.presentationAnchor = BetterAuthReactNativePasskeyModule.presentationAnchor(appContext: self.appContext)
      controller.performRequests()
      BetterAuthReactNativePasskeyModule.retain(delegate)
    }

  }
}

// MARK: - Helpers

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
