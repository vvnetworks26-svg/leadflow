import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Reuses vite.config.ts's aliases (@leadflow/shared, @leadflow/types, @)
// so tests resolve the same source files the real app does — no separate
// module-resolution setup to keep in sync.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
    },
  }),
);
