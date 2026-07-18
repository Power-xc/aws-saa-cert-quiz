import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'public', 'eslint.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true },
      ],
      // `||` is intentional for empty-string fallbacks on persisted values.
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        { ignoreArrowShorthand: true },
      ],
      // Persisted / imported data is typed for convenience but validated at
      // runtime, so these defensive guards are deliberate.
      '@typescript-eslint/no-unnecessary-condition': 'off',
      // Typed DOM/JSON lookup helpers legitimately use a single type parameter.
      '@typescript-eslint/no-unnecessary-type-parameters': 'off',
      // Clearing one key from a small saved-progress map — not a hot path.
      '@typescript-eslint/no-dynamic-delete': 'off',
    },
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  prettier,
);
