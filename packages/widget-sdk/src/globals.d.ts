/**
 * globals.d.ts
 *
 * Compile-time constants injected by esbuild via the `define` option.
 * Declaring them here keeps TypeScript happy without requiring a runtime value.
 */

/**
 * SDK version string — injected from package.json at build time.
 * Replaces the B.1.1 __WIDGET_VERSION__ constant.
 */
declare const __SDK_VERSION__: string;

/**
 * Legacy alias kept for backwards compatibility with B.1.1 test suite.
 * Both resolve to the same value at build time.
 * @deprecated Use __SDK_VERSION__ in all new code.
 */
declare const __WIDGET_VERSION__: string;
