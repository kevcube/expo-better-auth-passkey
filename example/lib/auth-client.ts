import { expoClient } from "@better-auth/expo/client";
import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { expoPasskeyClient } from "expo-better-auth-passkey";
import * as SecureStore from "expo-secure-store";

const rpId =
  process.env.EXPO_PUBLIC_PASSKEY_RP_ID || process.env.EXPO_PUBLIC_NGROK_URL;
const baseURL = rpId ? `https://${rpId}:8081` : "http://localhost:8081";
export const authClient = createAuthClient({
  baseURL,
  plugins: [
    anonymousClient(),
    expoPasskeyClient(),
    // @better-auth/expo 1.6.27 getActions is not assignable to better-auth 1.6.27
    expoClient({
      scheme: "github.kevcube.betterauthreactnativepasskey.example",
      storagePrefix: "better-auth-react-native-passkey-example",
      storage: SecureStore,
    }) as never,
  ],
});
