// Main export: drop-in replacement for better-auth's passkeyClient
export { expoPasskeyClient } from "./plugin";

// Re-export WebAuthn types from @simplewebauthn for convenience
export type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/types";
