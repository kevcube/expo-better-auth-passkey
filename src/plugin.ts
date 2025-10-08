import type {
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types";
import type { Session, User } from "better-auth";
import type {
	BetterAuthClientPlugin,
	BetterFetch,
	BetterFetchOption,
} from "better-auth/client";
import { getPasskeyActions, passkeyClient } from "better-auth/client/plugins";
import type { Passkey } from "better-auth/plugins/passkey";
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
		getActions: ($fetch: BetterFetch) => {
			return Platform.select({
					web: getPasskeyActions($fetch, { $listPasskeys }),
					default: getPasskeyActionsNative($fetch, { $listPasskeys }),
				})
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
	}: {
		$listPasskeys: ReturnType<typeof atom<number>>;
	},
) => {
	const signInPasskey = async (
		opts?: {
			autoFill?: boolean;
			email?: string;
			fetchOptions?: BetterFetchOption;
		},
		options?: BetterFetchOption,
	) => {
		const response = await $fetch<PublicKeyCredentialRequestOptionsJSON>(
			"/passkey/generate-authenticate-options",
			{
				method: "POST",
				body: {
					email: opts?.email,
				},
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
			return;
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
		$Infer: {} as {
			Passkey: Passkey;
		},
	};
};
