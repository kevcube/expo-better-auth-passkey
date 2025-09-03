# expo-better-auth-passkey

Native passkey support for [better-auth](https://github.com/better-auth/better-auth) in Expo and React Native apps.

**Supported Platforms**: iOS 15.1+, macOS 12.0+, Android (Credential Manager API), Web (WebAuthn)

## Installation

### Prerequisites

This package is a plugin for [better-auth](https://github.com/better-auth/better-auth). Make sure you have better-auth installed and configured in your project first:

```bash
npm install better-auth
```

### Install the plugin

```bash
npm expo install expo-better-auth-passkey
# or
yarn expo install expo-better-auth-passkey
# or
bun expo install expo-better-auth-passkey
```

### iOS Setup

Requires iOS 15.1+ and proper entitlements configuration.

### Android Setup

Uses the Credential Manager API on Android.

## Usage

This module is a drop-in replacement for better-auth's `passkeyClient` that works on native platforms:

```typescript
// Before (web only)
import { passkeyClient } from "better-auth/client/plugins";

// After (works on web, iOS, and Android)
import { expoPasskeyClient } from "better-auth-react-native-passkey";

// Use exactly the same as better-auth's passkey client
export const authClient = createAuthClient({
  baseURL: "https://your-server.com",
  plugins: [
    expoPasskeyClient(), // Now works on native!
  ],
});
```

## API

All methods from better-auth's passkey client are supported:

- `authClient.signIn.passkey()` - Sign in with passkey
- `authClient.passkey.addPasskey()` - Register a new passkey
- `authClient.passkey.deletePasskey()` - Delete a passkey
- `authClient.passkey.updatePasskey()` - Update passkey metadata
- `authClient.useListPasskeys()` - React hook to list user's passkeys

## How it Works

This module wraps better-auth's `passkeyClient` and transparently intercepts WebAuthn browser API calls (`navigator.credentials.create/get`) to use platform-native implementations:

- **Web**: Uses standard WebAuthn (unchanged)
- **iOS/macOS**: Uses AuthenticationServices framework
- **Android**: Uses Credential Manager API

The plugin delegates all server communication to better-auth's existing implementation, only replacing the client-side WebAuthn calls. The native modules accept and return standard WebAuthn JSON formats, ensuring full compatibility with better-auth's server-side passkey implementation.

# API documentation

- [Documentation for the latest stable release](https://docs.expo.dev/versions/latest/sdk/better-auth-react-native-passkey/)
- [Documentation for the main branch](https://docs.expo.dev/versions/unversioned/sdk/better-auth-react-native-passkey/)

# Installation in managed Expo projects

For [managed](https://docs.expo.dev/archive/managed-vs-bare/) Expo projects, please follow the installation instructions in the [API documentation for the latest stable release](#api-documentation). If you follow the link and there is no documentation available then this library is not yet usable within managed projects &mdash; it is likely to be included in an upcoming Expo SDK release.

# Contributing

Contributions are very welcome! Please refer to guidelines described in the [contributing guide]( https://github.com/expo/expo#contributing).
