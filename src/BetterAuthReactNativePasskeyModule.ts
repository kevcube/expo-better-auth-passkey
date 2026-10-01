import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { requireNativeModule } from "expo";

interface NativeBetterAuthReactNativePasskeyModule {
  registerPasskey(params: {
    optionsJSON: PublicKeyCredentialCreationOptionsJSON;
    useAutoRegister?: boolean;
  }): Promise<RegistrationResponseJSON>;

  authenticatePasskey(params: {
    optionsJSON: PublicKeyCredentialRequestOptionsJSON;
    useAutofill?: boolean;
  }): Promise<AuthenticationResponseJSON>;

  cancelPasskeyAutoFill(): Promise<void>;
}

export default requireNativeModule<NativeBetterAuthReactNativePasskeyModule>(
  "BetterAuthReactNativePasskey",
);
