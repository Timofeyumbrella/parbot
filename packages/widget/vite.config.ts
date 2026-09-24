import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    lib: {
      entry: `${here}src/index.ts`,
      name: 'Parbot',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    outDir: `${here}../../apps/web/public`,
    emptyOutDir: false,
    sourcemap: true,
    target: 'es2020',
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
});
