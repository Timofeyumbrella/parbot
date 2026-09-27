import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const FULL_PREFETCH =
  'Leave prefetch at its default. prefetch={true} caches the full payload of a dynamic route for minutes, so the screen shows stale data after changes made elsewhere; loading.tsx already makes the click instant.';

const PREFETCH_RULES = [
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
];

// supabase-js signs out globally by default: every browser signed in to the account, the shared
// demo account included, would lose its session. Only `{ scope: 'local' }` ends just this one.
const SIGN_OUT_RULE = {
  selector:
    "CallExpression[callee.property.name='signOut'][callee.object.property.name='auth']:not(:has(ObjectExpression > Property[key.name='scope'][value.value='local']))",
  message:
    "Pass { scope: 'local' } to auth.signOut(). The default scope signs the account out in every browser.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ['src/**/*.ts', 'scripts/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', SIGN_OUT_RULE],
    },
  },
  {
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': ['error', ...PREFETCH_RULES, SIGN_OUT_RULE],
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
