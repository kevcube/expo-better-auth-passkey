import { passkeyClient as betterAuthPasskeyClient } from "better-auth/client/plugins";

import PasskeyModule from "./BetterAuthReactNativePasskeyModule";

// Define a minimal type for our global navigator property
interface GlobalWithNavigator extends Omit<typeof globalThis, "navigator"> {
  navigator: any;
}

/**
 * Better Auth React Native Passkey Client Plugin
 *
 * This plugin wraps better-auth's passkey client and replaces WebAuthn browser API calls
 * with native module calls for React Native/Expo apps.
 *
 * It intercepts only the actual WebAuthn calls (navigator.credentials.create/get)
 * while delegating all server communication to better-auth's implementation.
 */
export const expoPasskeyClient: typeof betterAuthPasskeyClient = () => {
  // Get the original better-auth passkey client
  const originalClient = betterAuthPasskeyClient();

  // Override WebAuthn calls in the global scope for this client
  // This ensures any internal better-auth code that uses navigator.credentials
  // will use our native module instead
  const originalNavigator = (globalThis as GlobalWithNavigator).navigator;
  const mockNavigator = {
    ...originalNavigator,
    credentials: {
      create: async (options: any) => {
        // Convert the WebAuthn options to our native module format
        // The native module expects the publicKey options directly
        const credential = await PasskeyModule.createPasskey(options.publicKey);
        return credential;
      },
      get: async (options: any) => {
        // Convert the WebAuthn options to our native module format
        // The native module expects the publicKey options directly
        const credential = await PasskeyModule.getPasskey(options.publicKey);
        return credential;
      },
    },
  };

  // Return the original client with our WebAuthn interceptor
  return {
    ...originalClient,
    getActions: (fetch: any) => {
      // Temporarily replace navigator during action execution
      const actions = originalClient.getActions(fetch);

      // Wrap each passkey action to use our mock navigator
      const wrappedActions = {
        ...actions,
        signIn: {
          ...actions.signIn,
          passkey: async (...args: any[]) => {
            // Temporarily replace the global navigator
            const global = globalThis as GlobalWithNavigator;
            global.navigator = mockNavigator;
            try {
              return await actions.signIn.passkey(...args);
            } finally {
              // Restore the original navigator
              global.navigator = originalNavigator;
            }
          },
        },
        passkey: {
          ...actions.passkey,
          addPasskey: async (...args: any[]) => {
            // Temporarily replace the global navigator
            const global = globalThis as GlobalWithNavigator;
            global.navigator = mockNavigator;
            try {
              return await actions.passkey.addPasskey(...args);
            } finally {
              // Restore the original navigator
              global.navigator = originalNavigator;
            }
          },
        },
      };

      return wrappedActions;
    },
  };
};
