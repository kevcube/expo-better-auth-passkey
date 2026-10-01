# expo-better-auth-passkey

Expo/React Native drop-in replacement for the Better Auth [`passkeyClient`](https://github.com/better-auth/better-auth) that works everywhere Better Auth runs today: Web, Android, and iOS. macOS shares the same native implementation but still needs wider community testing—pull requests and reports are welcome.

## Why this module

- Drop-in client: swap `passkeyClient()` with `expoPasskeyClient()` and keep the exact same Better Auth API surface.
- Native Credential APIs: wraps WebAuthn calls with `ASAuthorizationController` on Apple platforms and Android Credential Manager on Android.
- Works with managed or bare Expo projects; no ejecting required.
- Single code path for web builds—falls back to the stock Better Auth web client when `Platform.OS === 'web'`.
- Typed like the stock client: `expoPasskeyClient()` has the same TypeScript type as `passkeyClient()`.

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
2. Expo SDK 55 or newer (tested with 57). For React Native CLI users, Expo Modules Autolinking must be set up.
3. `nanostores` available in your app (Better Auth already depends on it).

### Install the package

```bash
npm install expo-better-auth-passkey
# or
pnpm add expo-better-auth-passkey
# or
yarn add expo-better-auth-passkey
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
await authClient.signIn.passkey()
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
- **HTTPS only**: Passkeys require secure origins. During development, terminate TLS in front of Metro — Tailscale Serve (`tailscale serve --bg 8081` on a MagicDNS name) or a tunnel. Set that hostname as `rpID` / `origin`.

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
- Pass `{ autoFill: true }` to `signIn.passkey` for AutoFill-assisted sign-in from the QuickType bar (iOS 16+; macOS and older iOS show the modal sheet instead). The request stays pending until the user picks the suggestion, so cancel it when the user signs in another way or leaves the screen:
  ```ts
  import { cancelPasskeyAutoFill } from 'expo-better-auth-passkey'

  useEffect(() => {
    authClient.signIn.passkey({ autoFill: true }).then((result) => {
      if (result.error?.code === 'ERROR_CEREMONY_ABORTED') return
      // handle sign-in
    })
    return () => {
      cancelPasskeyAutoFill()
    }
  }, [])
  ```
  `cancelPasskeyAutoFill()` rejects the pending AutoFill request with `ERROR_CEREMONY_ABORTED`, including one still fetching its options, and resolves without effect when none is pending. Modal requests are never cancelled, so call it before starting a modal `signIn.passkey()` too. Starting a new AutoFill request cancels the previous one, so at most one is live. On macOS, Android, and web it has nothing to cancel and resolves immediately.

### Android

1. **Min requirements**: Android 9 (API 28) or newer. Users need Google Play Services 23.30+ for passkeys.
2. **App signing SHA-256**: Obtain your app signing certificate fingerprint. For debug builds:
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep 'SHA256:'
   ```
   Replace this with your Play App Signing fingerprint for production. Convert each raw SHA-256 fingerprint to base64 and add `android:apk-key-hash:<BASE64_SHA256>` entries to the Better Auth `origin` array so the server trusts credentials coming from your APK.
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
6. **Optional**: If you want to forward your Android app's HTTPS origin when calling Credential Manager, request the `android.permission.CREDENTIAL_MANAGER_SET_ORIGIN` permission (API 34+). The module automatically falls back when the permission is missing, so you can skip it if you don't need per-domain attribution.

The Android bridge rewrites `user.displayName` to match `user.name` before presenting the system dialog so that each passkey nickname shows up without conflicting with the persistent Better Auth `displayName` field.

### Web

No additional setup beyond the regular Better Auth client. The plugin detects the `web` platform and hands control back to Better Auth's built-in WebAuthn flow.

## Development workflow

- `pnpm build` – compile the TypeScript sources.
- `pnpm lint` – lint with the Expo module preset.
- `pnpm test` – run the Jest suite.
- `cd example && pnpm start` – launch the example app (`pnpm ios` / `pnpm android` for native builds). See [`example/README.md`](example/README.md) for the HTTPS and database setup it needs.

## Error handling & diagnostics

Native actions follow the behavior and error handling of `@better-auth/passkey` 1.7.7, including `addPasskey({ createSession: true })`, which signs the user in when the server returns a session. Returned errors keep Better Auth's `{ code, message, status, statusText }` shape; no `cause` field is added.

| Failure | `signIn.passkey()` | `passkey.addPasskey()` |
| --- | --- | --- |
| Recognized WebAuthn ceremony error | Original WebAuthn code, `"Auth cancelled"`, 400 `BAD_REQUEST` | Original WebAuthn code and message, 400 `BAD_REQUEST` |
| Native cancellation (`ERROR_CEREMONY_ABORTED`) | `ERROR_CEREMONY_ABORTED`, `"Auth cancelled"`, 400 | `ERROR_CEREMONY_ABORTED`, `"Registration cancelled"`, 400 |
| Already registered (`ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED`) | Original code, `"Auth cancelled"`, 400 | Original code, `"Previously registered"`, 400 |
| Internal or unrecognized failure | `AUTH_CANCELLED`, `"Auth cancelled"`, 400 `BAD_REQUEST` | `UNKNOWN_ERROR`, 500 `INTERNAL_SERVER_ERROR`; the `Error` message is preserved, otherwise `"Unknown error"` |

Thrown sign-in verification failures also return `AUTH_CANCELLED`/400, regardless of their code. Error responses returned by the server pass through unchanged.

Unlike earlier releases, platform codes such as `NO_ACTIVITY`, `INVALID_OPTIONS`, `CREATE_ERROR`, `GET_ERROR`, and `ERR_FAILED` no longer appear in returned errors. They use the action-specific fallback above. The obsolete `CANCELLED` code is no longer treated as a WebAuthn cancellation; current native modules emit `ERROR_CEREMONY_ABORTED`.

Native errors are still logged to the console with their original code and message. Use those logs for device diagnostics rather than relying on the normalized sign-in message.

## Contributing & macOS testing

macOS uses the same AuthenticationServices implementation as iOS but has limited coverage. If you can validate on macOS 12+, please open an issue or PR with results.

1. Fork the repo and install dependencies with `pnpm install` (this also installs the example workspace).
2. Run `pnpm lint`, `pnpm test`, and `pnpm build` before opening a PR.
3. Please include repro steps for any passkey edge cases you fix.

## License

MIT © kevcube
