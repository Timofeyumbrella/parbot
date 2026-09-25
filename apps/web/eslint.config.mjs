import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const FULL_PREFETCH =
  'Leave prefetch at its default. prefetch={true} caches the full payload of a dynamic route for minutes, so the screen shows stale data after changes made elsewhere; loading.tsx already makes the click instant.';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXOpeningElement[name.name='Link'] > JSXAttribute[name.name='prefetch'][value=null]",
          message: FULL_PREFETCH,
        },
        {
          selector:
            "JSXOpeningElement[name.name='Link'] > JSXAttribute[name.name='prefetch'] > JSXExpressionContainer > Literal[value=true]",
          message: FULL_PREFETCH,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Built by packages/widget; not our source.
    'public/widget.js',
    'public/widget.js.map',
    // Written by Playwright; the HTML reporter bundles its own trace viewer.
    'playwright-report/**',
    'test-results/**',
  ]),
]);

export default eslintConfig;
