import type {
  BetterAuthClientPlugin,
  ClientFetchOption,
  ClientStore,
} from "@better-auth/core";
import { getPasskeyActions, passkeyClient } from "@better-auth/passkey/client";
import type { Passkey } from "@better-auth/passkey/client";
import type { BetterFetch } from "@better-fetch/fetch";
import type {
  AuthenticationExtensionsClientInputs,
  AuthenticationExtensionsClientOutputs,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  WebAuthnErrorCode,
} from "@simplewebauthn/browser";
import type { Session, User } from "better-auth/types";
import { Platform } from "react-native";

import PasskeyModule from "./BetterAuthReactNativePasskeyModule";

/**
 * Expo/React Native passkey client that extends better-auth's `passkeyClient`
 * and overrides only the device WebAuthn calls to use React Native modules.
 */
export const expoPasskeyClient = (): BetterAuthClientPlugin => {
  const baseClient = passkeyClient();

  return {
    ...baseClient,
    getActions: (
      $fetch: BetterFetch,
      $store: ClientStore,
      _options?: unknown,
    ) => {
      const { $listPasskeys } = baseClient.getAtoms($fetch);
      if (Platform.OS === "web") {
        return getPasskeyActions($fetch, { $listPasskeys, $store });
      }
      return getPasskeyActionsNative($fetch, { $listPasskeys, $store });
    },
  } satisfies BetterAuthClientPlugin;
};

// Native rejections cross the Expo bridge without WebAuthnError's prototype.
// Only recognize SimpleWebAuthn codes, not arbitrary platform error codes.
const webAuthnErrorCodes: Record<WebAuthnErrorCode, true> = {
  ERROR_CEREMONY_ABORTED: true,
  ERROR_INVALID_DOMAIN: true,
  ERROR_INVALID_RP_ID: true,
  ERROR_INVALID_USER_ID_LENGTH: true,
  ERROR_MALFORMED_PUBKEYCREDPARAMS: true,
  ERROR_AUTHENTICATOR_GENERAL_ERROR: true,
  ERROR_AUTHENTICATOR_MISSING_DISCOVERABLE_CREDENTIAL_SUPPORT: true,
  ERROR_AUTHENTICATOR_MISSING_USER_VERIFICATION_SUPPORT: true,
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: true,
  ERROR_AUTHENTICATOR_NO_SUPPORTED_PUBKEYCREDPARAMS_ALG: true,
  ERROR_AUTO_REGISTER_USER_VERIFICATION_FAILURE: true,
  ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY: true,
};

const isNativeWebAuthnError = (
  error: unknown,
): error is { code: WebAuthnErrorCode; message: string } =>
  error !== null &&
  typeof error === "object" &&
  "code" in error &&
  typeof error.code === "string" &&
  Object.prototype.hasOwnProperty.call(webAuthnErrorCodes, error.code) &&
  "message" in error &&
  typeof error.message === "string";

export const getPasskeyActionsNative = (
  $fetch: BetterFetch,
  {
    $listPasskeys,
    $store,
  }: {
    $listPasskeys: { set: (value: number) => void };
    $store: ClientStore;
  },
) => {
  const signInPasskey = async (
    opts?: {
      autoFill?: boolean;
      extensions?: AuthenticationExtensionsClientInputs;
      returnWebAuthnResponse?: boolean;
      fetchOptions?: ClientFetchOption;
    },
    options?: ClientFetchOption,
  ) => {
    const response = await $fetch<PublicKeyCredentialRequestOptionsJSON>(
      "/passkey/generate-authenticate-options",
      {
        method: "GET",
        throw: false,
      },
    );
    if (!response.data) return response;

    const mergedExtensions =
      response.data.extensions || opts?.extensions
        ? {
            ...(response.data.extensions || {}),
            ...(opts?.extensions || {}),
          }
        : undefined;
    let assertion: AuthenticationResponseJSON;
    try {
      assertion = await PasskeyModule.authenticatePasskey({
        optionsJSON: {
          ...response.data,
          ...(mergedExtensions && { extensions: mergedExtensions }),
        },
        useAutofill: opts?.autoFill,
      });
    } catch (e) {
      console.error("Passkey sign-in error:", e);
      return {
        data: null,
        error: {
          code: isNativeWebAuthnError(e) ? e.code : "AUTH_CANCELLED",
          message: "Auth cancelled",
          status: 400,
          statusText: "BAD_REQUEST",
        },
      };
    }

    try {
      const { clientExtensionResults, ...responseBody } = assertion;
      const verified = await $fetch<{
        session: Session;
        user: User;
      }>("/passkey/verify-authentication", {
        body: { response: responseBody },
        ...opts?.fetchOptions,
        ...options,
        method: "POST",
        throw: false,
      });

      if (verified.data) {
        $listPasskeys.set(Math.random());
        $store.notify("$sessionSignal");
      }

      if (opts?.returnWebAuthnResponse) {
        return {
          ...verified,
          webauthn: {
            response: assertion as AuthenticationResponseJSON,
            clientExtensionResults:
              clientExtensionResults as AuthenticationExtensionsClientOutputs,
          },
        };
      }
      return verified;
    } catch (e) {
      console.error("Passkey verification error:", e);
      return {
        data: null,
        error: {
          code: "AUTH_CANCELLED",
          message: "Auth cancelled",
          status: 400,
          statusText: "BAD_REQUEST",
        },
      };
    }
  };

  const registerPasskey = async (
    opts?: {
      fetchOptions?: ClientFetchOption;
      name?: string;
      authenticatorAttachment?: "platform" | "cross-platform";
      context?: string | null;
      extensions?: AuthenticationExtensionsClientInputs;
      useAutoRegister?: boolean;
      returnWebAuthnResponse?: boolean;
    },
    fetchOpts?: ClientFetchOption,
  ) => {
    const optionsRes = await $fetch<PublicKeyCredentialCreationOptionsJSON>(
      "/passkey/generate-register-options",
      {
        method: "GET",
        query: {
          ...(opts?.authenticatorAttachment && {
            authenticatorAttachment: opts.authenticatorAttachment,
          }),
          ...(opts?.name && { name: opts.name }),
          ...(opts?.context && { context: opts.context }),
        },
        throw: false,
      },
    );

    if (!optionsRes.data) return optionsRes;

    try {
      const mergedExtensions =
        optionsRes.data.extensions || opts?.extensions
          ? {
              ...(optionsRes.data.extensions || {}),
              ...(opts?.extensions || {}),
            }
          : undefined;
      const attestation = await PasskeyModule.registerPasskey({
        optionsJSON: {
          ...optionsRes.data,
          ...(mergedExtensions && { extensions: mergedExtensions }),
        },
        useAutoRegister: opts?.useAutoRegister,
      });
      const { clientExtensionResults, ...responseBody } = attestation;

      const verified = await $fetch<Passkey>("/passkey/verify-registration", {
        ...opts?.fetchOptions,
        ...fetchOpts,
        body: {
          response: responseBody,
          name: opts?.name,
        },
        method: "POST",
        throw: false,
      });
      if (!verified.data) return verified;
      $listPasskeys.set(Math.random());
      if (opts?.returnWebAuthnResponse) {
        return {
          ...verified,
          webauthn: {
            response: attestation as RegistrationResponseJSON,
            clientExtensionResults:
              clientExtensionResults as AuthenticationExtensionsClientOutputs,
          },
        };
      }
      return verified;
    } catch (e) {
      console.error("Passkey registration error:", e);
      if (isNativeWebAuthnError(e)) {
        if (e.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
          return {
            data: null,
            error: {
              code: e.code,
              message: "Previously registered",
              status: 400,
              statusText: "BAD_REQUEST",
            },
          };
        }
        if (e.code === "ERROR_CEREMONY_ABORTED") {
          return {
            data: null,
            error: {
              code: e.code,
              message: "Registration cancelled",
              status: 400,
              statusText: "BAD_REQUEST",
            },
          };
        }
        return {
          data: null,
          error: {
            code: e.code,
            message: e.message,
            status: 400,
            statusText: "BAD_REQUEST",
          },
        };
      }
      return {
        data: null,
        error: {
          code: "UNKNOWN_ERROR",
          message: e instanceof Error ? e.message : "Unknown error",
          status: 500,
          statusText: "INTERNAL_SERVER_ERROR",
        },
      };
    }
  };

  return {
    signIn: {
      passkey: signInPasskey,
    },
    passkey: {
      addPasskey: registerPasskey,
    },
    $Infer: {} as {
      Passkey: Passkey;
    },
  };
};
