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
    useAutoRegister?: boolean,
  ): Promise<RegistrationResponseJSON> {
    // Delegate to @simplewebauthn/browser to handle conversions
    return await startRegistration({ optionsJSON: options, useAutoRegister });
  }

  async getPasskey(
    options: PublicKeyCredentialRequestOptionsJSON,
    useBrowserAutofill?: boolean,
  ): Promise<AuthenticationResponseJSON> {
    return await startAuthentication({ optionsJSON: options, useBrowserAutofill });
  }
}

export default registerWebModule(
  BetterAuthReactNativePasskeyModule,
  "BetterAuthReactNativePasskey",
);
