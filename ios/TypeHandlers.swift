import Foundation
import AuthenticationServices

enum PasskeyParseError: LocalizedError {
  case missing(String)
  case invalidBase64URL(String)

  var errorDescription: String? {
    switch self {
    case .missing(let field):
      return "Missing required field: \(field)"
    case .invalidBase64URL(let field):
      return "Invalid base64url value for \(field)"
    }
  }
}

struct PKCCreationRP {
  let id: String
  let name: String?

  init(dict: [String: Any]) throws {
    guard let id = dict["id"] as? String, !id.isEmpty else {
      throw PasskeyParseError.missing("rp.id")
    }
    self.id = id
    self.name = dict["name"] as? String
  }
}

struct PKCCreationUser {
  let id: String
  let name: String
  let displayName: String

  init(dict: [String: Any]) throws {
    guard let id = dict["id"] as? String, !id.isEmpty else {
      throw PasskeyParseError.missing("user.id")
    }
    guard let name = dict["name"] as? String else {
      throw PasskeyParseError.missing("user.name")
    }
    self.id = id
    self.name = name
    self.displayName = (dict["displayName"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? name
  }
}

struct PKCDescriptor {
  let id: String
  let transports: [String]

  init(dict: [String: Any]) throws {
    guard let id = dict["id"] as? String, !id.isEmpty else {
      throw PasskeyParseError.missing("credential.id")
    }
    self.id = id
    self.transports = dict["transports"] as? [String] ?? []
  }
}

struct PKCAuthenticatorSelection {
  let userVerification: String?
  let residentKey: String?
  let requireResidentKey: Bool?
  let authenticatorAttachment: String?

  init(dict: [String: Any]) {
    self.userVerification = dict["userVerification"] as? String
    self.residentKey = dict["residentKey"] as? String
    self.requireResidentKey = dict["requireResidentKey"] as? Bool
    self.authenticatorAttachment = dict["authenticatorAttachment"] as? String
  }
}

struct PKCPubKeyCredParam {
  let alg: Int

  init(dict: [String: Any]) throws {
    if let alg = dict["alg"] as? Int {
      self.alg = alg
    } else if let alg = dict["alg"] as? NSNumber {
      self.alg = alg.intValue
    } else {
      throw PasskeyParseError.missing("pubKeyCredParams.alg")
    }
  }
}

struct PublicKeyCredentialCreationOptionsJSONLite {
  let rp: PKCCreationRP
  let challenge: String
  let user: PKCCreationUser
  let excludeCredentials: [PKCDescriptor]
  let authenticatorSelection: PKCAuthenticatorSelection?
  let attestation: String?
  let pubKeyCredParams: [PKCPubKeyCredParam]

  init(dict: [String: Any]) throws {
    guard let rpDict = dict["rp"] as? [String: Any] else {
      throw PasskeyParseError.missing("rp")
    }
    guard let challenge = dict["challenge"] as? String, !challenge.isEmpty else {
      throw PasskeyParseError.missing("challenge")
    }
    guard let userDict = dict["user"] as? [String: Any] else {
      throw PasskeyParseError.missing("user")
    }
    self.rp = try PKCCreationRP(dict: rpDict)
    self.challenge = challenge
    self.user = try PKCCreationUser(dict: userDict)
    if let arr = dict["excludeCredentials"] as? [[String: Any]] {
      self.excludeCredentials = try arr.map { try PKCDescriptor(dict: $0) }
    } else {
      self.excludeCredentials = []
    }
    if let asel = dict["authenticatorSelection"] as? [String: Any] {
      self.authenticatorSelection = PKCAuthenticatorSelection(dict: asel)
    } else {
      self.authenticatorSelection = nil
    }
    self.attestation = dict["attestation"] as? String
    if let arr = dict["pubKeyCredParams"] as? [[String: Any]] {
      self.pubKeyCredParams = try arr.map { try PKCPubKeyCredParam(dict: $0) }
    } else {
      self.pubKeyCredParams = []
    }
  }
}

struct PublicKeyCredentialRequestOptionsJSONLite {
  let rpId: String
  let challenge: String
  let allowCredentials: [PKCDescriptor]
  let userVerification: String?

  init(dict: [String: Any]) throws {
    guard let rpId = dict["rpId"] as? String, !rpId.isEmpty else {
      throw PasskeyParseError.missing("rpId")
    }
    guard let challenge = dict["challenge"] as? String, !challenge.isEmpty else {
      throw PasskeyParseError.missing("challenge")
    }
    self.rpId = rpId
    self.challenge = challenge
    if let arr = dict["allowCredentials"] as? [[String: Any]] {
      self.allowCredentials = try arr.map { try PKCDescriptor(dict: $0) }
    } else {
      self.allowCredentials = []
    }
    self.userVerification = dict["userVerification"] as? String
  }
}

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
  let type: String
  let response: ResponseFields
  let authenticatorAttachment: String?
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
  let type: String
  let response: ResponseFields
  let authenticatorAttachment: String?
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
