import { registerWebModule, NativeModule } from 'expo';

import { BetterAuthReactNativePasskeyModuleEvents } from './BetterAuthReactNativePasskey.types';

class BetterAuthReactNativePasskeyModule extends NativeModule<BetterAuthReactNativePasskeyModuleEvents> {
  PI = Math.PI;
  async setValueAsync(value: string): Promise<void> {
    this.emit('onChange', { value });
  }
  hello() {
    return 'Hello world! 👋';
  }
}

export default registerWebModule(BetterAuthReactNativePasskeyModule, 'BetterAuthReactNativePasskeyModule');
