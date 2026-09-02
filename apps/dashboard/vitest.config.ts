import path from 'path';
import { defineConfig } from 'vitest/config';

// vite.config.ts here is a callback config (conditional server.hmr logic),
// which vitest's mergeConfig cannot merge — so the same aliases it defines
// are duplicated directly here instead.
export default defineConfig({
  resolve: {
    alias: [
      { find: '@leadflow/shared/widgetApiClient', replacement: path.resolve(__dirname, '../../packages/shared/src/widgetApiClient.ts') },
      { find: '@leadflow/shared',                 replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts') },
      { find: '@leadflow/types',                  replacement: path.resolve(__dirname, '../../packages/types/src/index.ts') },
      { find: '@',                                replacement: path.resolve(__dirname, '.') },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
  },
});
