/**
 * build.mjs
 *
 * esbuild configuration for the LeadFlow widget SDK.
 *
 * Output: dist/widget.js
 *   - Single self-contained IIFE (no module system, no imports at runtime)
 *   - Targets browsers that support ES2017 (~97% global coverage)
 *   - Minified in production, sourcemap in development
 *   - Zero external dependencies
 *
 * Version injection:
 *   __SDK_VERSION__    → package.json version  (used in B.1.2+)
 *   __WIDGET_VERSION__ → package.json version  (B.1.1 legacy alias, same value)
 *
 * Usage:
 *   node build.mjs           # production build
 *   node build.mjs --watch   # development watch mode
 */

import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const watch  = process.argv.includes('--watch');
const isProd = !watch;

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));

/** @type {import('esbuild').BuildOptions} */
const config = {
  entryPoints: ['src/index.ts'],
  bundle:      true,
  outfile:     'dist/widget.js',
  format:      'iife',
  target:      ['es2017', 'chrome80', 'firefox78', 'safari13', 'edge80'],
  platform:    'browser',
  minify:      isProd,
  sourcemap:   !isProd,

  define: {
    '__SDK_VERSION__':    JSON.stringify(version),
    '__WIDGET_VERSION__': JSON.stringify(version),   // B.1.1 legacy alias
  },

  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(config);
  await ctx.watch();
  console.log('[widget-sdk] Watching for changes…');
} else {
  await esbuild.build(config);
}
