import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
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
