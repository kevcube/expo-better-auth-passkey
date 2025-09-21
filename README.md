# expo-better-auth-passkey

Expo/React Native drop-in replacement for the Better Auth [`passkeyClient`](https://github.com/better-auth/better-auth) that works everywhere Better Auth runs today: Web, Android, and iOS. macOS shares the same native implementation but still needs wider community testing—pull requests and reports are welcome.

## Why this module

- Drop-in client: swap `passkeyClient()` with `expoPasskeyClient()` and keep the exact same Better Auth API surface.
- Native Credential APIs: wraps WebAuthn calls with `ASAuthorizationController` on Apple platforms and Android Credential Manager on Android.
- Works with managed or bare Expo projects; no ejecting required.
- Single code path for web builds—falls back to the stock Better Auth web client when `Platform.OS === 'web'`.
- TypeScript-first with strict types mirrored from `@simplewebauthn/types`.

## Supported platforms

| Platform | Status | Notes |
| --- | --- | --- |
| Web | ✅ | Uses Better Auth's default WebAuthn client |
| iOS 15.1+ | ✅ | Uses `ASAuthorizationPlatformPublicKeyCredentialProvider` |
| Android (Credential Manager) | ✅ | Requires Google Play Services 23.30+ |
| macOS 12+ | ⚠️ Needs testing | Same native code path as iOS; please file issues/PRs |

## Installation

### Prerequisites

1. A Better Auth server configured with the `passkey` plugin. Make sure the server runs on HTTPS with a hostname that matches the relying party ID (`rpID`).
2. Expo SDK 49 or newer (tested with 54). For React Native CLI users, Expo Modules Autolinking must be set up.
3. `nanostores` available in your app (Better Auth already depends on it).

### Install the package

```bash
npm install expo-better-auth-passkey
# or
yarn add expo-better-auth-passkey
# or
bun add expo-better-auth-passkey
```

The native module is autolinked. If you use a bare/React Native CLI project, run `npx pod-install` after installing.

## Usage

Replace the standard `passkeyClient` with `expoPasskeyClient`. Nothing else changes:

```ts
import { createAuthClient } from 'better-auth/react'
import { expoPasskeyClient } from 'expo-better-auth-passkey'

export const authClient = createAuthClient({
  baseURL: 'https://your-api.mydomain.com',
  plugins: [
    expoPasskeyClient(),
    // ...the rest of your Better Auth client plugins
  ],
})

// Works exactly like Better Auth's stock client:
await authClient.passkey.addPasskey({ name: 'My iPhone' })
await authClient.signIn.passkey({ email: 'user@example.com' })
```

The module internally forwards every server call to Better Auth and only overrides the WebAuthn credential creation/retrieval steps. Web builds automatically fall back to the original Better Auth WebAuthn implementation.

## Server configuration checklist

- **Better Auth passkey plugin**: Configure `rpID`, `rpName`, and `origin` to match the public domain your app will use. When you ship Android builds, add an `android:apk-key-hash:<BASE64_SHA256>` entry for every signing certificate so Better Auth can validate APK-originated passkey requests.
- **Trusted origins**: Include all app schemes you intend to use, e.g. `myapp://`, `https://localhost`, and any Expo dev tunnels. Example:
  ```ts
  trustedOrigins: [
    'https://auth.example.com',
    'myapp://',
    'com.example.myapp://',
  ]
  ```
- **HTTPS only**: Passkeys require secure origins. Use a tunneling service (ngrok, localhost HTTPS) during development.

## Platform-specific setup

### iOS (and macOS)

1. Enable the **Associated Domains** capability in Xcode or via `expo prebuild` config (`ios.associatedDomains`).
2. Add a `webcredentials:` entry for every relying party domain:
   ```json
   {
     "expo": {
       "ios": {
         "associatedDomains": [
           "webcredentials:auth.example.com"
         ]
       }
     }
   }
   ```
3. Host an `apple-app-site-association` file at `https://auth.example.com/.well-known/apple-app-site-association` with content similar to:
   ```json
   {
     "applinks": { "apps": [], "details": [] },
     "webcredentials": {
       "apps": ["<TEAMID>.com.example.myapp"]
     }
   }
   ```
   - No file extension and served as `application/json` (or `application/pkcs7-mime`).
   - `<TEAMID>` is your Apple developer team ID; the bundle identifier must match your release build.
4. Make sure your `Info.plist` allows the relying party hostname as an associated domain. Expo handles this automatically when `associatedDomains` is set.

Optional hints supported by this module:
- Pass `{ useAutoRegister: true }` to `addPasskey` to request the platform UI to suggest immediate passkey creation (iOS 16+).
- Pass `{ autoFill: true }` to `signIn.passkey` to allow autofill suggestions (iOS 16+).

### Android

1. **Min requirements**: Android 9 (API 28) or newer with Credential Manager 1.3.0+. Users need Google Play Services 23.30+ for passkeys.
2. **App signing SHA-256**: Obtain your app signing certificate fingerprint. For debug builds:
   ```bash
 keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep 'SHA256:'
  ```
 Replace this with your Play App Signing fingerprint for production. Convert each raw SHA-256 fingerprint to base64 and add `android:apk-key-hash:<BASE64_SHA256>` entries to the Better Auth `origin` array so the server trusts credentials coming from your APK.
5. **Optional**: If you want to forward your Android app's HTTPS origin when calling Credential Manager, request the `android.permission.CREDENTIAL_MANAGER_SET_ORIGIN` permission (API 34+). The module automatically falls back when the permission is missing, so you can skip it if you don't need per-domain attribution.
6. The Android bridge rewrites `user.displayName` to match `user.name` before presenting the system dialog so that each passkey nickname shows up without conflicting with the persistent Better Auth `displayName` field.
3. Host `https://auth.example.com/.well-known/assetlinks.json` with content:
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "com.example.myapp",
         "sha256_cert_fingerprints": [
           "12:34:56:...:AB"
         ]
       }
     }
   ]
   ```
   - `package_name` is your Android application ID.
   - Include every signing fingerprint you use (debug, release, Play signing).
4. If you use Expo managed workflow, set `android.package` in `app.json`/`app.config.js` so autolinking matches the identifier above.
5. Ensure the relying party hostname (`rpID`) exactly matches the host portion of your HTTPS domain (`auth.example.com`). The module automatically injects the `origin` field before returning to Better Auth.

### Web

No additional setup beyond the regular Better Auth client. The plugin detects the `web` platform and hands control back to Better Auth's built-in WebAuthn flow.

## Development workflow

- `npm run build` – compile the TypeScript sources.
- `npm run lint` – lint with Expo module preset.
- `npm run test` – run the Expo module test runner.
- `cd example && npm install && npm start` – launch the example app. Use `npm run ios` / `npm run android` from the `example` directory for device simulators.

## Error handling & diagnostics

- User cancellations surface as Better Auth errors with code `AUTH_CANCELLED` so you can display friendly UI.
- Native errors are logged to the console for debugging. Use a production logging service to capture them on devices.
- Android Credential Manager exceptions (`NO_ACTIVITY`, `CREATE_ERROR`, `GET_ERROR`) bubble through the returned error object—inspect `result.error` when debugging.

## Contributing & macOS testing

macOS uses the same AuthenticationServices implementation as iOS but has limited coverage. If you can validate on macOS 12+, please open an issue or PR with results. Contributions for advanced features (cross-platform authenticators, passkey list management, web fallbacks) are encouraged.

1. Fork the repo and install dependencies with `npm install`.
2. Use `npm run build` before opening a PR to ensure the generated `build/` output is up to date.
3. Follow the lint/test scripts above. Please include repro steps for any passkey edge cases you fix.

## License

MIT © kevcube
