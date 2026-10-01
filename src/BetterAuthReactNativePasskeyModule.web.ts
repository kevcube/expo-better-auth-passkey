import {
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/browser";
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

  // Web sign-in goes through Better Auth's own SimpleWebAuthn flow, which
  // aborts a pending browser-autofill request whenever another ceremony
  // starts. No iOS-style assisted controller exists here to cancel.
  async cancelPasskeyAutoFill(): Promise<void> {}
}

export default registerWebModule(
  BetterAuthReactNativePasskeyModule,
  "BetterAuthReactNativePasskey",
);
