import { requireNativeView } from 'expo';
import * as React from 'react';

import { BetterAuthReactNativePasskeyViewProps } from './BetterAuthReactNativePasskey.types';

const NativeView: React.ComponentType<BetterAuthReactNativePasskeyViewProps> =
  requireNativeView('BetterAuthReactNativePasskey');

export default function BetterAuthReactNativePasskeyView(props: BetterAuthReactNativePasskeyViewProps) {
  return <NativeView {...props} />;
}
