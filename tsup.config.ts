import { defineConfig } from 'tsup';
import { cp } from 'node:fs/promises';

export default defineConfig([
  {
    entry: { 'core/index': 'src/core/index.ts', 'react/index': 'src/react/index.ts' },
    format: ['esm'],
    external: ['react']
  },
  {
    entry: { 'getup-consent.iife': 'src/iife.ts' },
    format: ['iife'],
    minify: true,
    outExtension: () => ({ js: '.js' }),
    async onSuccess() {
      await cp('src/theme', 'dist/theme', { recursive: true });
      await cp('node_modules/orejime/dist', 'dist/vendor/orejime', { recursive: true });
      await cp('node_modules/orejime/LICENSE', 'dist/vendor/orejime/LICENSE');
    }
  }
]);
