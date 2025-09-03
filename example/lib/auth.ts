import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins/anonymous";
import { passkey } from "better-auth/plugins/passkey";
import { Pool } from "pg";

export const auth = betterAuth({
  appName: "Openteller",
  baseURL: "https://590d7ab45878.ngrok-free.app",
  database: new Pool({
    connectionString: "postgres://auth:auth@localhost:5432/auth",
  }),
  plugins: [
    anonymous(),
    passkey({
      rpID: "590d7ab45878.ngrok-free.app",
      rpName: "Expo Better Auth Passkey Example",
      origin: "https://590d7ab45878.ngrok-free.app",
    }),
    expo(),
  ],
  trustedOrigins: [
    "https://590d7ab45878.ngrok-free.app",
    "better-auth-react-native-passkey-example://",
    "http://localhost:8081",
  ],
});
