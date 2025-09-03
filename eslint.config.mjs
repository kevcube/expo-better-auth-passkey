import universeNative from 'eslint-config-universe/flat/native.js';
import universeWeb from 'eslint-config-universe/flat/web.js';

export default [
  ...universeNative,
  ...universeWeb,
  {
    ignores: ['build/**', 'node_modules/**', 'example/**', '*.config.js', '*.config.mjs'],
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {},
  },
];
