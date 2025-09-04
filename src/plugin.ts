import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/types";
import { useAuthQuery as createAuthQueryAtom } from "better-auth/client";
import type {
  BetterAuthClientPlugin,
  BetterFetch,
  BetterFetchOption,
} from "better-auth/client";
import type { Passkey } from "better-auth/plugins/passkey";
import { atom } from "nanostores";

import PasskeyModule from "./BetterAuthReactNativePasskeyModule";

/**
 * Expo/React Native passkey client that mirrors better-auth's `passkeyClient`
 * without importing it (to avoid node:crypto and web recursion issues).
 */
export const expoPasskeyClient = (): BetterAuthClientPlugin => {
  const $listPasskeys = atom<any>();

  const getPasskeyActions = ($fetch: BetterFetch) => {
    const signInPasskey = async (
      opts?: {
        autoFill?: boolean;
        email?: string;
        fetchOptions?: BetterFetchOption;
      },
      options?: BetterFetchOption,
    ): Promise<
      | {
          data: null;
          error: { message?: string; status: number; statusText: string };
        }
      | { data: { session: any; user: any }; error: null }
    > => {
      const response = await $fetch("/passkey/generate-authenticate-options", {
        method: "POST",
        body: { email: opts?.email },
      });
      if (!response.data) return response as any;
      try {
        const assertion: AuthenticationResponseJSON =
          await PasskeyModule.getPasskey(response.data as any);
        const verified = await $fetch("/passkey/verify-authentication", {
          body: { response: assertion },
          ...opts?.fetchOptions,
          ...options,
          method: "POST",
        });
        return verified as any;
      } catch (e: any) {
        return asClientError(e, "auth");
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
    ): Promise<
      | {
          data: null;
          error: { message?: string; status: number; statusText: string };
        }
      | undefined
    > => {
      const optionsRes = await $fetch("/passkey/generate-register-options", {
        method: "GET",
        query: {
          ...(opts?.authenticatorAttachment
            ? { authenticatorAttachment: opts.authenticatorAttachment }
            : {}),
          ...(opts?.name ? { name: opts.name } : {}),
        },
      });
      if (!optionsRes.data) return optionsRes as any;
      try {
        const attestation: RegistrationResponseJSON =
          await PasskeyModule.createPasskey(optionsRes.data as any);
        const verified = await $fetch("/passkey/verify-registration", {
          ...opts?.fetchOptions,
          ...fetchOpts,
          body: { response: attestation, name: opts?.name },
          method: "POST",
        });
        if (!verified.data) return verified as any;
        $listPasskeys.set(Math.random());
        return undefined;
      } catch (e: any) {
        return asClientError(e, "registration");
      }
    };

    return {
      signIn: { passkey: signInPasskey },
      passkey: { addPasskey: registerPasskey },
      $Infer: {},
    } as const;
  };

  return {
    id: "passkey",
    $InferServerPlugin: {
      id: "passkey",
    },
    getActions: ($fetch: BetterFetch) => getPasskeyActions($fetch),
    getAtoms($fetch: BetterFetch) {
      const listPasskeys = createAuthQueryAtom<Passkey[] | null>(
        $listPasskeys,
        "/passkey/list-user-passkeys",
        $fetch,
        { method: "GET" },
      );
      return { listPasskeys, $listPasskeys } as const;
    },
    pathMethods: {
      "/passkey/register": "POST",
      "/passkey/authenticate": "POST",
    },
    atomListeners: [
      {
        matcher(path: string) {
          return (
            path === "/passkey/verify-registration" ||
            path === "/passkey/delete-passkey" ||
            path === "/passkey/update-passkey"
          );
        },
        signal: "$listPasskeys",
      },
    ],
  } as const;
};

function asClientError(e: any, phase: "auth" | "registration") {
  const defaultMsg =
    phase === "auth" ? "auth cancelled" : "registration cancelled";
  const msg = (e && (typeof e === "string" ? e : e.message)) || defaultMsg;
  const normalized = /abort|cancel|dismiss|not allowed|unsupported/i.test(msg)
    ? phase === "auth"
      ? "WebAuthn is not supported in this browser"
      : "WebAuthn is not supported in this browser"
    : msg;
  return {
    data: null as null,
    error: {
      message: normalized,
      status: 500,
      statusText: "INTERNAL_SERVER_ERROR",
    },
  } as const;
}
