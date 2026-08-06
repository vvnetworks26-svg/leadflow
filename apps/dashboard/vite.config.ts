import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: '@leadflow/shared/widgetApiClient', replacement: path.resolve(__dirname, '../../packages/shared/src/widgetApiClient.ts') },
        { find: '@leadflow/shared',                 replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts') },
        { find: '@leadflow/types',                  replacement: path.resolve(__dirname, '../../packages/types/src/index.ts') },
        { find: '@',                                replacement: path.resolve(__dirname, '.') },
      ],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
