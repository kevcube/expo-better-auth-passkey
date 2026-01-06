import { getPasskeyActions, passkeyClient } from "@better-auth/passkey/client";
import type { Passkey } from "@better-auth/passkey/client";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types";
import type { ClientStore, Session, User } from "better-auth";
import type {
  BetterAuthClientPlugin,
  BetterFetch,
  BetterFetchOption,
} from "better-auth/client";
import { atom } from "nanostores";
import { Platform } from "react-native";

import PasskeyModule from "./BetterAuthReactNativePasskeyModule";

/**
 * Expo/React Native passkey client that extends better-auth's `passkeyClient`
 * and overrides only the device WebAuthn calls to use React Native modules.
 */

export const expoPasskeyClient = () => {
  // Get the base passkey client
  const baseClient = passkeyClient();
  const $listPasskeys = atom<number>(0);

  return {
    id: baseClient.id,
    $InferServerPlugin: baseClient.$InferServerPlugin,
    getActions: ($fetch: BetterFetch, $store: ClientStore) => {
      if (Platform.OS === "web") {
        return getPasskeyActions($fetch, { $listPasskeys, $store });
      } else {
        return getPasskeyActionsNative($fetch, { $listPasskeys, $store });
      }
    },
    getAtoms: baseClient.getAtoms,
    pathMethods: baseClient.pathMethods,
    atomListeners: baseClient.atomListeners,
  } satisfies BetterAuthClientPlugin;
};

export const getPasskeyActionsNative = (
  $fetch: BetterFetch,
  {
    $listPasskeys,
    $store,
  }: {
    $listPasskeys: ReturnType<typeof atom<number>>;
    $store: ClientStore;
  },
) => {
  const signInPasskey = async (
    opts?: {
      autoFill?: boolean;
      fetchOptions?: BetterFetchOption;
    },
    options?: BetterFetchOption,
  ) => {
    const response = await $fetch<PublicKeyCredentialRequestOptionsJSON>(
      "/passkey/generate-authenticate-options",
      {
        method: "GET",
      },
    );
    if (!response.data) return response;

    try {
      const assertion = await PasskeyModule.authenticatePasskey({
        optionsJSON: response.data,
        useAutofill: opts?.autoFill,
      });
      const verified = await $fetch<{
        session: Session;
        user: User;
      }>("/passkey/verify-authentication", {
        body: { response: assertion },
        ...opts?.fetchOptions,
        ...options,
        method: "POST",
      });

      if (verified.data) {
        $listPasskeys.set(Math.random());
        $store.notify("$sessionSignal");
      }
      return verified;
    } catch (e) {
      console.error("Passkey sign-in error:", e);
      let errorMessage = "auth cancelled";
      if (e instanceof Error) {
        errorMessage = e.message;
      }
      return {
        data: null,
        error: {
          code: "AUTH_CANCELLED",
          message: errorMessage,
          status: 400,
          statusText: "BAD_REQUEST",
        },
      };
    }
  };

  const registerPasskey = async (
    opts?: {
      fetchOptions?: BetterFetchOption;
      name?: string;
      authenticatorAttachment?: "platform" | "cross-platform";
      useAutoRegister?: boolean;
    },
    fetchOpts?: BetterFetchOption,
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
        },
      },
    );

    if (!optionsRes.data) return optionsRes;

    try {
      const attestation = await PasskeyModule.registerPasskey({
        optionsJSON: optionsRes.data,
        useAutoRegister: opts?.useAutoRegister,
      });

      const verified = await $fetch<{ passkey: Passkey }>(
        "/passkey/verify-registration",
        {
          ...opts?.fetchOptions,
          ...fetchOpts,
          body: {
            response: attestation,
            name: opts?.name,
          },
          method: "POST",
        },
      );
      if (!verified.data) return verified;
      $listPasskeys.set(Math.random());
      return verified;
    } catch (e) {
      console.error("Passkey registration error:", e);
      let errorMessage = "auth cancelled";
      if (e instanceof Error) {
        errorMessage = e.message;
      }
      return {
        data: null,
        error: {
          code: "AUTH_CANCELLED",
          message: errorMessage,
          status: 400,
          statusText: "BAD_REQUEST",
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
    $Infer: {},
  };
};
