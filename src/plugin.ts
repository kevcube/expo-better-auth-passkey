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

const nativeError = (error: unknown): { code: string; message: string } => {
  if (error instanceof Error && error.message) {
    const code =
      "code" in error && typeof error.code === "string"
        ? error.code
        : "UNKNOWN_ERROR";
    return { code, message: error.message };
  }
  if (error && typeof error === "object") {
    const record = error as { code?: unknown; message?: unknown };
    if (typeof record.message === "string" && record.message) {
      return {
        code: typeof record.code === "string" ? record.code : "UNKNOWN_ERROR",
        message: record.message,
      };
    }
  }
  return { code: "AUTH_CANCELLED", message: "auth cancelled" };
};

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

    try {
      const mergedExtensions =
        response.data.extensions || opts?.extensions
          ? {
              ...(response.data.extensions || {}),
              ...(opts?.extensions || {}),
            }
          : undefined;
      const assertion = await PasskeyModule.authenticatePasskey({
        optionsJSON: {
          ...response.data,
          ...(mergedExtensions && { extensions: mergedExtensions }),
        },
        useAutofill: opts?.autoFill,
      });
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
      const { code, message } = nativeError(e);
      console.error("Passkey sign-in error:", e);
      return {
        data: null,
        error: {
          code: code === "UNKNOWN_ERROR" ? "AUTH_CANCELLED" : code,
          message,
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
      const { code, message } = nativeError(e);
      console.error("Passkey registration error:", e);
      if (code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
        return {
          data: null,
          error: {
            code,
            message: "Previously registered",
            status: 400,
            statusText: "BAD_REQUEST",
          },
        };
      }
      if (code === "ERROR_CEREMONY_ABORTED" || code === "CANCELLED") {
        return {
          data: null,
          error: {
            code: "ERROR_CEREMONY_ABORTED",
            message: "Registration cancelled",
            status: 400,
            statusText: "BAD_REQUEST",
          },
        };
      }
      return {
        data: null,
        error: {
          code: code === "AUTH_CANCELLED" ? "UNKNOWN_ERROR" : code,
          message,
          status: code === "AUTH_CANCELLED" ? 500 : 400,
          statusText:
            code === "AUTH_CANCELLED" ? "INTERNAL_SERVER_ERROR" : "BAD_REQUEST",
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
