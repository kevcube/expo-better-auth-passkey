import { expoClient } from "@better-auth/expo/client";
import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { passkeyClient as rnPasskeyClient } from "better-auth-react-native-passkey";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
  baseURL: "http://localhost:8081",
  plugins: [
    anonymousClient(),
    rnPasskeyClient(),
    expoClient({
      scheme: "github.kevcube.betterauthreactnativepasskey.example",
      storagePrefix: "better-auth-react-native-passkey-example",
      storage: SecureStore,
    }),
  ],
});
