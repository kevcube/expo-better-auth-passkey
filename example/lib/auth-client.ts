import { expoClient } from "@better-auth/expo/client";
import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { expoPasskeyClient } from "expo-better-auth-passkey";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
  baseURL: "https://590d7ab45878.ngrok-free.app",
  plugins: [
    anonymousClient(),
    expoPasskeyClient(),
    expoClient({
      scheme: "github.kevcube.betterauthreactnativepasskey.example",
      storagePrefix: "better-auth-react-native-passkey-example",
      storage: SecureStore,
    }),
  ],
});
