# Better Auth React Native Passkey - Implementation Notes

## Architecture Overview

This plugin provides a minimal, clean integration with better-auth's passkey client by:

1. **Wrapping better-auth's `passkeyClient`**: We import and wrap the original client from `better-auth/client/plugins`
2. **Intercepting WebAuthn API calls**: We temporarily replace `navigator.credentials.create()` and `navigator.credentials.get()` with our native module implementations
3. **Delegating server communication**: All server API calls remain handled by better-auth's implementation

## Key Design Decisions

### Minimal Surface Area
- We don't duplicate any server communication logic
- We don't override endpoints like `/generate-authenticate-options` or `/verify-authentication`
- We only intercept the browser WebAuthn API calls that need native implementation

### Transparent Integration
- The plugin exports as `passkeyClient` - a drop-in replacement for better-auth's client
- Users can import from `better-auth-react-native-passkey` instead of `better-auth/client/plugins`
- All of better-auth's passkey features work unchanged

### Implementation Details

The plugin works by:
1. Creating a mock `navigator` object with our native module implementations
2. Temporarily replacing `globalThis.navigator` during passkey operations
3. Restoring the original navigator after each operation
4. This ensures all internal better-auth code uses our native implementations

## File Structure

```
src/
├── index.ts                              # Main exports
├── plugin.ts                             # Core plugin implementation
├── BetterAuthReactNativePasskeyModule.ts # Native module wrapper
├── BetterAuthReactNativePasskey.types.ts # Module event types only
└── __tests__/
    └── plugin.test.ts                    # Unit tests
```

Note: WebAuthn types (`PublicKeyCredentialCreationOptionsJSON`, etc.) are imported from `@simplewebauthn/types` rather than being redefined, ensuring compatibility with better-auth's type system.

## Usage

```typescript
import { passkeyClient } from "better-auth-react-native-passkey";
import { createAuthClient } from "better-auth/client";

const authClient = createAuthClient({
  baseURL: "https://your-server.com",
  plugins: [
    passkeyClient(), // Works on iOS, Android, and Web!
  ],
});

// All better-auth passkey methods work unchanged:
await authClient.signIn.passkey();
await authClient.passkey.addPasskey();
```

## Dependency Strategy

- **better-auth**: Listed as both peer dependency (for users) and dev dependency (for development)
  - Peer dependency ensures we use the user's version of better-auth
  - Avoids version conflicts and duplicate installations
  - Range `>=1.0.0` provides flexibility while ensuring compatibility

- **@simplewebauthn packages**: Listed as peer dependencies
  - These are already dependencies of better-auth
  - Ensures we use the same versions as better-auth

## Benefits of This Approach

1. **Minimal code surface**: Less code to maintain and test
2. **Full compatibility**: All better-auth features work as expected
3. **Future-proof**: Updates to better-auth's passkey client automatically benefit this plugin
4. **Clean abstraction**: Native module details are hidden from the consumer
5. **Platform consistency**: Same API across web, iOS, and Android
