import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Reuses vite.config.ts's aliases (@leadflow/shared, @leadflow/types, @) so
// tests resolve the same source files the real app does. No DOM is needed —
// the regression tests here call function components directly rather than
// rendering to jsdom.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      globals: true,
    },
  }),
);
