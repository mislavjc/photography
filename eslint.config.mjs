import { FlatCompat } from '@eslint/eslintrc';
import prettierPlugin from 'eslint-plugin-prettier';
import simpleImportSortPlugin from 'eslint-plugin-simple-import-sort';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
    ],
  },
  {
    rules: {
      'no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
  {
    plugins: {
      'simple-import-sort': simpleImportSortPlugin,
    },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: ['*.js', '*.jsx', '*.ts', '*.tsx'],
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: [
            // Packages `react` related packages come first.
            ['^react', '^@?\\w'],
            // Database
            ['^(|db)(/.*|$)'],
            // Server actions
            ['^(|actions)(/.*|$)'],
            // UI components
            ['^(|ui)(/.*|$)'],
            // Internal packages.
            ['^(|components)(/.*|$)'],
            // hooks
            ['^(|hooks)(/.*|$)'],
            // Lib
            ['^(|lib)(/.*|$)'],
            // APi
            ['^(|api)(/.*|$)'],
            // Utils
            ['^(|utils)(/.*|$)'],
            // Types
            ['^(|types)(/.*|$)'],
            // Public files
            ['^(|public)(/.*|$)'],
            // Side effect imports.
            ['^\\u0000'],
            // Parent imports. Put `..` last.
            ['^\\.\\.(?!/?$)', '^\\.\\./?$'],
            // Other relative imports. Put same-folder imports and `.` last.
            ['^\\./(?=.*/)(?!/?$)', '^\\.(?!/?$)', '^\\./?$'],
            // Style imports.
            ['^.+\\.?(css)$'],
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
