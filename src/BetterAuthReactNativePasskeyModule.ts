import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/types";
import { requireNativeModule } from "expo";

interface BetterAuthReactNativePasskeyModule {
  createPasskey(
    options: PublicKeyCredentialCreationOptionsJSON
  ): Promise<RegistrationResponseJSON>;

  getPasskey(
    options: PublicKeyCredentialRequestOptionsJSON
  ): Promise<AuthenticationResponseJSON>;
}

export default requireNativeModule<BetterAuthReactNativePasskeyModule>(
  "BetterAuthReactNativePasskey"
);
