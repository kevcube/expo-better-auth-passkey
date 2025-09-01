// Reexport the native module. On web, it will be resolved to BetterAuthReactNativePasskeyModule.web.ts
// and on native platforms to BetterAuthReactNativePasskeyModule.ts
export { default } from './BetterAuthReactNativePasskeyModule';
export { default as BetterAuthReactNativePasskeyView } from './BetterAuthReactNativePasskeyView';
export * from  './BetterAuthReactNativePasskey.types';
