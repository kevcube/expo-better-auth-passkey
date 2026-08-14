import { expo } from "@better-auth/expo";
import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins/anonymous";
import { Pool } from "pg";

const rpId =
  process.env.EXPO_PUBLIC_PASSKEY_RP_ID ||
  process.env.EXPO_PUBLIC_NGROK_URL ||
  "localhost";
const apiOrigin =
  rpId === "localhost"
    ? "http://localhost:8081"
    : `https://${rpId}:8081`;
const webAuthnOrigin =
  rpId === "localhost" ? apiOrigin : `https://${rpId}`;

export const auth = betterAuth({
  appName: "Expo Better Auth Passkey Example",
  baseURL: apiOrigin,
  database: new Pool({
    connectionString: "postgres://auth:auth@localhost:5432/auth",
  }),
  plugins: [
    anonymous(),
    passkey({
      rpID: rpId,
      rpName: "Expo Better Auth Passkey Example",
      origin: [
        "android:apk-key-hash:-sYXRdwJA3hvue3mKpYrOZ9zSPC7b4mbgzJmdZEDO5w",
        webAuthnOrigin,
      ],
    }),
    expo(),
  ],
  trustedOrigins: [
    "android:apk-key-hash:-sYXRdwJA3hvue3mKpYrOZ9zSPC7b4mbgzJmdZEDO5w",
    apiOrigin,
    webAuthnOrigin,
    "better-auth-react-native-passkey-example://",
    "github.kevcube.betterauthreactnativepasskey.example://",
    "http://localhost:8081",
    "http://kevins-laptop.local:8081",
    "http://kbp.local:8081",
  ],
});
