// @ts-check
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'specs/**', '.specify/**', '.claude/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        // allowDefaultProject covers root-level config files, which are not
        // part of any tsconfig `include` but still need parsing.
        projectService: {
          allowDefaultProject: ['*.js', '*.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      // TypeScript already reports undefined identifiers; ESLint's version only
      // produces false positives on Node globals.
      'no-undef': 'off',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    // Constitution: the domain core must never depend on an MCP SDK.
    // This boundary delivers FR-002 (deployment boundary) and the dual-adapter
    // support in research R3. Breaking it is a design failure, not a style
    // issue -- hence 'error', never a warning.
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
);
