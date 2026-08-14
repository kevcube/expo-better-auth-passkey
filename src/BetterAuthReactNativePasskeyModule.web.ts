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
  async registerPasskey({
    optionsJSON,
    useAutoRegister,
  }: {
    optionsJSON: PublicKeyCredentialCreationOptionsJSON;
    useAutoRegister?: boolean;
  }): Promise<RegistrationResponseJSON> {
    return await startRegistration({ optionsJSON, useAutoRegister });
  }

  async authenticatePasskey({
    optionsJSON,
    useAutofill,
  }: {
    optionsJSON: PublicKeyCredentialRequestOptionsJSON;
    useAutofill?: boolean;
  }): Promise<AuthenticationResponseJSON> {
    return await startAuthentication({
      optionsJSON,
      useBrowserAutofill: useAutofill,
    });
  }
}

export default registerWebModule(
  BetterAuthReactNativePasskeyModule,
  "BetterAuthReactNativePasskey",
);
