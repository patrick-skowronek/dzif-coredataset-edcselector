import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // The ODM parser uses DOMParser, so the tests need a DOM.
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
      // The tests run against the real 1.9 MB ODM files; parsing one takes seconds
      // in jsdom, and several tests parse the whole dataset more than once.
      testTimeout: 30_000,
    },
  }),
);
