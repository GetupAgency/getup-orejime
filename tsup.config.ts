import { defineConfig } from 'tsup';
import { cp } from 'node:fs/promises';

export default defineConfig([
  {
    entry: { 'core/index': 'src/core/index.ts', 'react/index': 'src/react/index.ts' },
    format: ['esm'],
    external: ['react']
    // No `dts: true` here on purpose: it crashes at require() time because
    // rollup-plugin-dts (bundled inside tsup) reads `ts.sys`, which the
    // installed typescript@7 (native/Go port) no longer exports. Type
    // declarations are generated separately — see `tsc -p tsconfig.build.json`
    // in the "build" npm script and the comment at the top of that file.
    // No `clean: true` here either: tsup runs the entries in this array
    // concurrently, not in sequence, so a per-entry clean races the other
    // entry's output. `dist/` is cleaned once, up front, in "build".
  },
  {
    entry: { 'getup-consent.iife': 'src/iife.ts' },
    format: ['iife'],
    minify: true,
    // tsup's default output name for iife is `<entry>.global.js`, not
    // `<entry>.js`. This is required to be `getup-consent.iife.js`.
    outExtension: () => ({ js: '.js' }),
    async onSuccess() {
      await cp('src/theme', 'dist/theme', { recursive: true });
      await cp('node_modules/orejime/dist', 'dist/vendor/orejime', { recursive: true });
      await cp('node_modules/orejime/LICENSE', 'dist/vendor/orejime/LICENSE');
    }
  }
]);
