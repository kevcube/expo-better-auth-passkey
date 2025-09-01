import { NativeModule, requireNativeModule } from 'expo';

import { BetterAuthReactNativePasskeyModuleEvents } from './BetterAuthReactNativePasskey.types';

declare class BetterAuthReactNativePasskeyModule extends NativeModule<BetterAuthReactNativePasskeyModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<BetterAuthReactNativePasskeyModule>('BetterAuthReactNativePasskey');
