import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Single source for the version shown in the app: package.json.
const { version } = JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string };

// `base` is set from BASE_PATH so the same source can be served from the root of
// a DZIF web server or from a GitHub Pages project subpath (/<repo>/).
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [svelte()],
  build: {
    target: 'es2022',
    // The app has no dynamic imports, so Rollup emits a single chunk: the whole
    // app ships as one JS file next to index.html, which keeps deployment trivial.
    rollupOptions: {
      output: {
        entryFileNames: 'app.js',
        assetFileNames: 'app[extname]',
      },
    },
  },
  test: {
    // Sets default hook timeout to 30 seconds globally
    hookTimeout: 30000, 
  },
});