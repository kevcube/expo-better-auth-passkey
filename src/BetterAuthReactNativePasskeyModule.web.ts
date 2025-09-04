import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/types";
import { registerWebModule, NativeModule } from "expo";

class BetterAuthReactNativePasskeyModule extends NativeModule {
  async createPasskey(
    options: PublicKeyCredentialCreationOptionsJSON,
  ): Promise<RegistrationResponseJSON> {
    // Delegate to @simplewebauthn/browser to handle conversions
    return await startRegistration({ optionsJSON: options });
  }

  async getPasskey(
    options: PublicKeyCredentialRequestOptionsJSON,
  ): Promise<AuthenticationResponseJSON> {
    return await startAuthentication({ optionsJSON: options });
  }
}

export default registerWebModule(
  BetterAuthReactNativePasskeyModule,
  "BetterAuthReactNativePasskey",
);
