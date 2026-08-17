import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // The ODM parser uses DOMParser, so the tests need a DOM.
      environment: 'jsdom',
      include: ['src/**/*.test.ts'],
      // The tests run against the real 1.9 MB ODM files. Parsing one through jsdom's
      // DOMParser takes seconds locally and roughly twice that on a GitHub runner, and
      // some tests parse the whole dataset more than once. `hookTimeout` matters as
      // much as `testTimeout` here, because the fixtures are parsed in `beforeAll`.
      testTimeout: 60_000,
      hookTimeout: 60_000,
    },
  }),
);
