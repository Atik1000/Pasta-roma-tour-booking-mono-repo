import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';

import { reactConfig } from './react.mjs';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

/**
 * Flat config for the Next.js apps.
 *
 * `eslint-config-next` is still eslintrc-shaped, so it is bridged through
 * FlatCompat — which also swaps in its own parser. That parser produces an AST
 * the typescript-eslint rules cannot walk, so the standard parser is restored
 * afterwards; Next's own rules are parser-agnostic.
 */
export const nextConfig = tseslint.config(
  ...reactConfig,
  ...compat.extends('next/core-web-vitals'),
  {
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: 'module' },
    },
    rules: {
      // Type-aware; the apps lint without a TypeScript program for speed.
      '@typescript-eslint/consistent-type-imports': 'off',
      '@next/next/no-html-link-for-pages': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
);

export default nextConfig;
