import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/** apps/web/.env is a link to the root .env; integration tests need the local Supabase keys. */
const envFromFile = () => {
  try {
    const text = readFileSync(fileURLToPath(new URL('./.env', import.meta.url)), 'utf8');

    return Object.fromEntries(
      text
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const index = line.indexOf('=');

          return [
            line.slice(0, index).trim(),
            line
              .slice(index + 1)
              .trim()
              .replace(/^"|"$/g, ''),
          ];
        }),
    );
  } catch {
    return {};
  }
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./src/test/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    clearMocks: true,
    env: { ...envFromFile(), AI_PROVIDER: 'stub' },
  },
});
