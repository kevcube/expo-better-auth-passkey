import Foundation
import AuthenticationServices

// Simplified WebAuthn JSON shapes, assuming inputs conform to @simplewebauthn/types.

// MARK: - Creation Options

struct PKCCreationRP {
  let id: String
  init(dict: [String: Any]) { self.id = dict["id"] as! String }
}

struct PKCCreationUser {
  let id: String
  let name: String
  let displayName: String
  init(dict: [String: Any]) {
    self.id = dict["id"] as! String
    self.name = dict["name"] as! String
    self.displayName = dict["displayName"] as! String
  }
}

struct PKCDescriptor {
  let id: String
  init(dict: [String: Any]) { self.id = dict["id"] as! String }
}

struct PKCAuthenticatorSelection {
  let userVerification: String?
  init(dict: [String: Any]) { self.userVerification = dict["userVerification"] as? String }
}

struct PublicKeyCredentialCreationOptionsJSONLite {
  let rp: PKCCreationRP
  let challenge: String
  let user: PKCCreationUser
  let excludeCredentials: [PKCDescriptor]
  let authenticatorSelection: PKCAuthenticatorSelection?

  init(dict: [String: Any]) {
    self.rp = PKCCreationRP(dict: dict["rp"] as! [String: Any])
    self.challenge = dict["challenge"] as! String
    self.user = PKCCreationUser(dict: dict["user"] as! [String: Any])
    if let arr = dict["excludeCredentials"] as? [[String: Any]] {
      self.excludeCredentials = arr.map { PKCDescriptor(dict: $0) }
    } else {
      self.excludeCredentials = []
    }
    if let asel = dict["authenticatorSelection"] as? [String: Any] {
      self.authenticatorSelection = PKCAuthenticatorSelection(dict: asel)
    } else {
      self.authenticatorSelection = nil
    }
  }
}

// MARK: - Request Options
struct PublicKeyCredentialRequestOptionsJSONLite {
  let rpId: String
  let challenge: String
  let allowCredentials: [PKCDescriptor]
  let userVerification: String?

  init(dict: [String: Any]) {
    self.rpId = dict["rpId"] as! String
    self.challenge = dict["challenge"] as! String
    if let arr = dict["allowCredentials"] as? [[String: Any]] {
      self.allowCredentials = arr.map { PKCDescriptor(dict: $0) }
    } else {
      self.allowCredentials = []
    }
    self.userVerification = dict["userVerification"] as? String
  }
}

// MARK: - Registration Response JSON
struct RegistrationResponseJSONLite {
  struct ResponseFields {
    let clientDataJSON: String
    let attestationObject: String
    let transports: [String]

    func toDictionary() -> [String: Any] {
      return [
        "clientDataJSON": clientDataJSON,
        "attestationObject": attestationObject,
        "transports": transports,
      ]
    }
  }

  let id: String
  let rawId: String
  let type: String // "public-key"
  let response: ResponseFields
  let authenticatorAttachment: String? // "platform"
  let clientExtensionResults: [String: Any]

  func toDictionary() -> [String: Any] {
    var dict: [String: Any] = [
      "id": id,
      "rawId": rawId,
      "type": type,
      "response": response.toDictionary(),
      "clientExtensionResults": clientExtensionResults,
    ]
    if let aa = authenticatorAttachment { dict["authenticatorAttachment"] = aa }
    return dict
  }
}

// MARK: - Authentication Response JSON
struct AuthenticationResponseJSONLite {
  struct ResponseFields {
    let clientDataJSON: String
    let authenticatorData: String
    let signature: String
    let userHandle: String?

    func toDictionary() -> [String: Any] {
      var dict: [String: Any] = [
        "clientDataJSON": clientDataJSON,
        "authenticatorData": authenticatorData,
        "signature": signature,
      ]
      if let uh = userHandle { dict["userHandle"] = uh }
      return dict
    }
  }

  let id: String
  let rawId: String
  let type: String // "public-key"
  let response: ResponseFields
  let authenticatorAttachment: String? // "platform"
  let clientExtensionResults: [String: Any]

  func toDictionary() -> [String: Any] {
    var dict: [String: Any] = [
      "id": id,
      "rawId": rawId,
      "type": type,
      "response": response.toDictionary(),
      "clientExtensionResults": clientExtensionResults,
    ]
    if let aa = authenticatorAttachment { dict["authenticatorAttachment"] = aa }
    return dict
  }
}
