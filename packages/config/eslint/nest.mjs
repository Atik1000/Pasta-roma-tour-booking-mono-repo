import globals from 'globals';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.mjs';

/** Flat config for the NestJS API. */
export const nestConfig = tseslint.config(...baseConfig, {
  files: ['**/*.ts'],
  languageOptions: {
    globals: { ...globals.node, ...globals.jest },
  },
  rules: {
    // Nest's DI reads constructor parameter types from `emitDecoratorMetadata`,
    // which only works when the class is imported as a value.
    '@typescript-eslint/consistent-type-imports': 'off',
    // Nest's DI relies on parameter properties and decorator metadata.
    '@typescript-eslint/no-extraneous-class': 'off',
    '@typescript-eslint/no-empty-object-type': 'off',
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
});

export default nestConfig;
