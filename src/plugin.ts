import type { ClientFetchOption, ClientStore } from "@better-auth/core";
import { getPasskeyActions, passkeyClient } from "@better-auth/passkey/client";
import type { Passkey } from "@better-auth/passkey/client";
import type { BetterFetch } from "@better-fetch/fetch";
import type {
  AuthenticationExtensionsClientInputs,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  WebAuthnErrorCode,
} from "@simplewebauthn/browser";
import type { Session, User } from "better-auth/types";
import { Platform } from "react-native";

import PasskeyModule from "./BetterAuthReactNativePasskeyModule";

// @better-auth/passkey exports no named type for its client plugin.
type PasskeyClientPlugin = ReturnType<typeof passkeyClient>;

/**
 * Expo/React Native passkey client that extends better-auth's `passkeyClient`
 * and overrides only the device WebAuthn calls to use React Native modules.
 */
export const expoPasskeyClient = (): PasskeyClientPlugin => {
  const baseClient = passkeyClient();

  return {
    ...baseClient,
    getActions: ($fetch, $store) => {
      const { $listPasskeys } = baseClient.getAtoms($fetch);
      if (Platform.OS === "web") {
        return getPasskeyActions($fetch, { $listPasskeys, $store });
      }
      return getPasskeyActionsNative($fetch, { $listPasskeys, $store });
    },
  };
};

// Bumped by every cancel so an AutoFill sign-in still fetching its options
// does not start a native request after the caller cancelled it.
let autoFillGeneration = 0;

/**
 * Cancels the pending AutoFill-assisted request started by
 * `signIn.passkey({ autoFill: true })` (iOS 16+). That sign-in
 * resolves with an `ERROR_CEREMONY_ABORTED` error. Resolves without effect
 * when no assisted request is pending; modal requests are never cancelled.
 * Other platforms have no assisted request of this module's to cancel.
 */
export const cancelPasskeyAutoFill = (): Promise<void> => {
  autoFillGeneration++;
  return PasskeyModule.cancelPasskeyAutoFill();
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

// Upstream returns this shape for every client-side ceremony failure.
const failure = (
  code: string,
  message: string,
  status = 400,
  statusText = "BAD_REQUEST",
) => ({ data: null, error: { code, message, status, statusText } });

const registrationMessages: Partial<Record<WebAuthnErrorCode, string>> = {
  ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED: "Previously registered",
  ERROR_CEREMONY_ABORTED: "Registration cancelled",
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
    const generation = autoFillGeneration;
    const response = await $fetch<PublicKeyCredentialRequestOptionsJSON>(
      "/passkey/generate-authenticate-options",
      { method: "GET", throw: false },
    );
    if (!response.data) return response;
    if (opts?.autoFill && generation !== autoFillGeneration) {
      return failure("ERROR_CEREMONY_ABORTED", "Auth cancelled");
    }

    const extensions =
      response.data.extensions || opts?.extensions
        ? { ...response.data.extensions, ...opts?.extensions }
        : undefined;
    let assertion: AuthenticationResponseJSON;
    try {
      assertion = await PasskeyModule.authenticatePasskey({
        optionsJSON: { ...response.data, ...(extensions && { extensions }) },
        useAutofill: opts?.autoFill,
      });
    } catch (e) {
      console.error("Passkey sign-in error:", e);
      return failure(
        isNativeWebAuthnError(e) ? e.code : "AUTH_CANCELLED",
        "Auth cancelled",
      );
    }

    try {
      const { clientExtensionResults, ...responseBody } = assertion;
      const verified = await $fetch<{ session: Session; user: User }>(
        "/passkey/verify-authentication",
        {
          body: { response: responseBody },
          ...opts?.fetchOptions,
          ...options,
          method: "POST",
          throw: false,
        },
      );

      if (verified.data) {
        $listPasskeys.set(Math.random());
        $store.notify("$sessionSignal");
      }

      if (opts?.returnWebAuthnResponse) {
        return {
          ...verified,
          webauthn: { response: assertion, clientExtensionResults },
        };
      }
      return verified;
    } catch (e) {
      console.error("Passkey verification error:", e);
      return failure("AUTH_CANCELLED", "Auth cancelled");
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
      createSession?: boolean;
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
      const extensions =
        optionsRes.data.extensions || opts?.extensions
          ? { ...optionsRes.data.extensions, ...opts?.extensions }
          : undefined;
      const attestation = await PasskeyModule.registerPasskey({
        optionsJSON: { ...optionsRes.data, ...(extensions && { extensions }) },
        useAutoRegister: opts?.useAutoRegister,
      });
      const { clientExtensionResults, ...responseBody } = attestation;

      const verified = await $fetch<
        Passkey & { session?: Session; user?: User }
      >("/passkey/verify-registration", {
        ...opts?.fetchOptions,
        ...fetchOpts,
        body: {
          response: responseBody,
          name: opts?.name,
          ...(opts?.createSession && { createSession: true }),
        },
        method: "POST",
        throw: false,
      });
      if (!verified.data) return verified;
      $listPasskeys.set(Math.random());
      if (verified.data.session) $store.notify("$sessionSignal");
      if (opts?.returnWebAuthnResponse) {
        return {
          ...verified,
          webauthn: { response: attestation, clientExtensionResults },
        };
      }
      return verified;
    } catch (e) {
      console.error("Passkey registration error:", e);
      if (isNativeWebAuthnError(e)) {
        return failure(e.code, registrationMessages[e.code] ?? e.message);
      }
      return failure(
        "UNKNOWN_ERROR",
        e instanceof Error ? e.message : "Unknown error",
        500,
        "INTERNAL_SERVER_ERROR",
      );
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
