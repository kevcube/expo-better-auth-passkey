import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { anonymous } from "better-auth/plugins/anonymous";
import { passkey } from "better-auth/plugins/passkey";
import { Pool } from "pg";

export const auth = betterAuth({
	appName: "Openteller",
	baseURL: "http://kevins-laptop.local:8081",
	database: new Pool({
		connectionString: "postgres://auth:auth@localhost:5432/auth",
	}),
	plugins: [
		anonymous(),
		passkey({
			rpID: process.env.EXPO_PUBLIC_NGROK_URL,
			rpName: "Expo Better Auth Passkey Example",
			origin: [
				"android:apk-key-hash:-sYXRdwJA3hvue3mKpYrOZ9zSPC7b4mbgzJmdZEDO5w",
				`https://${process.env.EXPO_PUBLIC_NGROK_URL}`,
			],
		}),
		expo(),
	],
	trustedOrigins: [
		"android:apk-key-hash:-sYXRdwJA3hvue3mKpYrOZ9zSPC7b4mbgzJmdZEDO5w",
		`https://${process.env.EXPO_PUBLIC_NGROK_URL}`,
		"better-auth-react-native-passkey-example://",
		"github.kevcube.betterauthreactnativepasskey.example://",
		"http://localhost:8081",
		"http://kevins-laptop.local:8081",
	],
});
