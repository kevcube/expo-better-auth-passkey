import {
  base64URLStringToBuffer,
  bufferToBase64URLString,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from "@simplewebauthn/types";
import { registerWebModule, NativeModule } from "expo";

const toBuffer = (b64url?: string) =>
  b64url ? base64URLStringToBuffer(b64url) : undefined;
class BetterAuthReactNativePasskeyModule extends NativeModule {
  async createPasskey(
    options: PublicKeyCredentialCreationOptionsJSON
  ): Promise<RegistrationResponseJSON> {
    if (!("credentials" in navigator) || !navigator.credentials?.create) {
      throw new Error("WebAuthn not supported in this environment");
    }

    const publicKey: PublicKeyCredentialCreationOptions = {
      rp: options.rp,
      user: {
        ...options.user,
        id: new Uint8Array(toBuffer(options.user.id)!),
      },
      challenge: toBuffer(options.challenge)!,
      pubKeyCredParams: options.pubKeyCredParams,
      timeout: options.timeout,
      attestation: options.attestation,
      excludeCredentials: options.excludeCredentials?.map((c) => ({
        type: c.type,
        id: new Uint8Array(toBuffer(c.id)!),
        transports: c.transports as AuthenticatorTransport[] | undefined,
      })),
      authenticatorSelection: options.authenticatorSelection as any,
      extensions: options.extensions as any,
    };

    const cred = (await navigator.credentials.create({
      publicKey,
    })) as PublicKeyCredential & {
      response: AuthenticatorAttestationResponse;
    };

    const transports = cred.response.getTransports?.() as
      | AuthenticatorTransportFuture[]
      | undefined;

    return {
      id: cred.id,
      rawId: bufferToBase64URLString(cred.rawId),
      type: cred.type as "public-key",
      response: {
        clientDataJSON: bufferToBase64URLString(cred.response.clientDataJSON),
        attestationObject: bufferToBase64URLString(
          cred.response.attestationObject
        ),
        transports,
      },
      clientExtensionResults:
        (cred.getClientExtensionResults?.() as any) || undefined,
    };
  }

  async getPasskey(
    options: PublicKeyCredentialRequestOptionsJSON
  ): Promise<AuthenticationResponseJSON> {
    if (!("credentials" in navigator) || !navigator.credentials?.get) {
      throw new Error("WebAuthn not supported in this environment");
    }

    const publicKey: PublicKeyCredentialRequestOptions = {
      challenge: toBuffer(options.challenge)!,
      timeout: options.timeout,
      rpId: options.rpId,
      allowCredentials: options.allowCredentials?.map((c) => ({
        type: c.type,
        id: new Uint8Array(toBuffer(c.id)!),
        transports: c.transports as AuthenticatorTransport[] | undefined,
      })),
      userVerification: options.userVerification,
      extensions: options.extensions as any,
    };

    const cred = (await navigator.credentials.get({
      publicKey,
    })) as PublicKeyCredential & {
      response: AuthenticatorAssertionResponse;
    };

    return {
      id: cred.id,
      rawId: bufferToBase64URLString(cred.rawId),
      type: cred.type as "public-key",
      response: {
        clientDataJSON: bufferToBase64URLString(cred.response.clientDataJSON),
        authenticatorData: bufferToBase64URLString(
          cred.response.authenticatorData
        ),
        signature: bufferToBase64URLString(cred.response.signature),
        userHandle: cred.response.userHandle
          ? bufferToBase64URLString(cred.response.userHandle)
          : undefined,
      },
      clientExtensionResults:
        (cred.getClientExtensionResults?.() as any) || undefined,
    };
  }
}

export default registerWebModule(
  BetterAuthReactNativePasskeyModule,
  "BetterAuthReactNativePasskeyModule"
);
