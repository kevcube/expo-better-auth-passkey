import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins/anonymous";
import { passkey } from "better-auth/plugins/passkey";
import { Pool } from "pg";

export const auth = betterAuth({
  appName: "Openteller",
  baseURL: "http://localhost:8081",
  database: new Pool({
    connectionString: "postgres://auth:auth@localhost:5432/auth",
  }),
  plugins: [
    anonymous(),
    passkey({
      rpID: "localhost",
      rpName: "Expo Better Auth Passkey Example",
      origin: "http://localhost:8081",
    }),
    expo(),
  ],
  trustedOrigins: [
    "http://localhost:8081",
    "better-auth-react-native-passkey-example://",
  ],
});
