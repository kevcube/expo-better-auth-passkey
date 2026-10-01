import { registerWebModule, NativeModule } from "expo";

// Web ceremonies go through Better Auth's own `getPasskeyActions`, so only the
// module's platform-neutral entry points live here.
class BetterAuthReactNativePasskeyModule extends NativeModule {
  // SimpleWebAuthn aborts a pending browser-autofill request whenever another
  // ceremony starts. No iOS-style assisted controller exists here to cancel.
  async cancelPasskeyAutoFill(): Promise<void> {}
}

export default registerWebModule(
  BetterAuthReactNativePasskeyModule,
  "BetterAuthReactNativePasskey",
);
