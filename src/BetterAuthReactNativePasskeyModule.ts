import type {
	AuthenticationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from "@simplewebauthn/types";
import { requireNativeModule } from "expo";

interface NativeBetterAuthReactNativePasskeyModule {
	registerPasskey(params: {
		optionsJSON: PublicKeyCredentialCreationOptionsJSON;
		useAutoRegister?: boolean;
	}): Promise<RegistrationResponseJSON>;

	authenticatePasskey(params: {
		optionsJSON: PublicKeyCredentialRequestOptionsJSON;
		useAutofill?: boolean;
	}): Promise<AuthenticationResponseJSON>;
}

const NativeModule =
	requireNativeModule<NativeBetterAuthReactNativePasskeyModule>(
		"BetterAuthReactNativePasskey",
	);

const BetterAuthReactNativePasskeyModule = {
	registerPasskey({
		optionsJSON,
		useAutoRegister,
	}: {
		optionsJSON: PublicKeyCredentialCreationOptionsJSON;
		useAutoRegister?: boolean;
	}) {
		return NativeModule.registerPasskey({ optionsJSON, useAutoRegister });
	},

	authenticatePasskey({
		optionsJSON,
		useAutofill,
	}: {
		optionsJSON: PublicKeyCredentialRequestOptionsJSON;
		useAutofill?: boolean;
	}) {
		return NativeModule.authenticatePasskey({ optionsJSON, useAutofill });
	},
};

export default BetterAuthReactNativePasskeyModule;
