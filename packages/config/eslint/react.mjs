import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

import { baseConfig } from './base.mjs';

/** Flat config for React libraries (packages/ui, packages/hooks). */
export const reactConfig = tseslint.config(...baseConfig, {
  files: ['**/*.{ts,tsx}'],
  plugins: { react, 'react-hooks': reactHooks },
  languageOptions: {
    globals: { ...globals.browser },
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
  settings: { react: { version: 'detect' } },
  rules: {
    ...react.configs.flat.recommended.rules,
    ...reactHooks.configs.recommended.rules,
    // The new JSX transform makes these obsolete.
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'react/jsx-curly-brace-presence': ['warn', { props: 'never', children: 'never' }],
    'react/self-closing-comp': 'warn',
  },
});

export default reactConfig;
