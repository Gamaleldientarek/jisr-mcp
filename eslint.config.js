// @ts-check
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'specs/**', '.specify/**'],
  },
  js.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: './tsconfig.json', sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Constitution: the domain core must never depend on an MCP SDK.
    // This boundary is what delivers FR-002 (deployment boundary) and the
    // dual-adapter support in research R3. Breaking it is a design failure,
    // not a style issue -- hence 'error', never a warning.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@modelcontextprotocol/*', '@modelcontextprotocol/**'],
              message:
                'src/core must not import an MCP SDK. Tool logic stays transport-agnostic; SDK use belongs in src/adapters. See plan.md > Structure Decision.',
            },
          ],
        },
      ],
    },
  },
];
