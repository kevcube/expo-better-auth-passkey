# Agent Guidelines for better-auth-react-native-passkey

## Build/Test Commands
- **Build library**: `npm run build` or `expo-module build`
- **Clean build**: `npm run clean` or `expo-module clean`
- **Lint code**: `npm run lint` or `expo-module lint`
- **Run tests**: `npm run test` or `expo-module test`
- **Run single test**: `expo-module test --testNamePattern="test name"`
- **Example app**: `cd example && npm start` (iOS/Android: `npm run ios`/`npm run android`)

## Code Style Guidelines

### TypeScript/JavaScript
- Use strict TypeScript with explicit types for all exports
- PascalCase for components, interfaces, types, and classes
- camelCase for functions, variables, and properties
- Import organization: React → Expo → Local types → Local modules
- Use `import type` for type-only imports
- Prefer arrow functions for component definitions

### Native Modules (Android/iOS)
- Comprehensive JSDoc comments for all public APIs
- Event-driven architecture with explicit event definitions
- Async functions for operations that may block
- Consistent naming: ModuleName + Module/View suffix

### Error Handling
- Use try/catch in async functions
- Emit events for error states rather than throwing
- Validate inputs in native module functions

### Formatting
- ESLint with universe/native and universe/web rules
- No semicolons (Prettier default)
- 2-space indentation
- Single quotes for strings

### File Organization
- `src/` for cross-platform code
- `android/`/`ios/` for platform-specific implementations
- `example/` for demo application
- Clear separation between web/native implementations