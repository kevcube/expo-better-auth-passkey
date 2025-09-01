import * as React from 'react';

import { BetterAuthReactNativePasskeyViewProps } from './BetterAuthReactNativePasskey.types';

export default function BetterAuthReactNativePasskeyView(props: BetterAuthReactNativePasskeyViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
