/**
 * appUrls.ts
 *
 * Single source of truth for the two cross-app URLs baked into every Vite
 * bundle at build time: VITE_DASHBOARD_URL (marketing → dashboard links)
 * and VITE_API_URL (dashboard/widget → API base URL). Each of marketing,
 * dashboard, and widget used to independently do
 * `import.meta.env.VITE_X ?? 'http://localhost:PORT'` — when a Vercel
 * project left the var unset, the shipped bundle permanently pointed real
 * visitors at their own machine (this already happened in production, on
 * marketing's Sign In/Sign Up links).
 *
 * In dev, a missing var still falls back to localhost — correct and
 * expected without a .env file. In production, a missing var throws
 * immediately instead of silently degrading, so a bad deploy fails loudly
 * (at module load, or at first render for a component that calls this
 * during render) rather than shipping broken links.
 */

function readEnvVar(key: string): string | undefined {
  return (typeof import.meta !== 'undefined' ? (import.meta as any).env?.[key] : undefined) as
    | string
    | undefined;
}

function isProdBuild(): boolean {
  return (typeof import.meta !== 'undefined' ? (import.meta as any).env?.PROD : false) === true;
}

/**
 * The dev-fallback / prod-throw decision, as a pure function of plain
 * values rather than `import.meta.env` reads — kept separate (and exported)
 * so it can be unit-tested directly. `import.meta.env` is a build-time
 * construct injected per-module by Vite/Vitest; it can't be reliably
 * stubbed across module boundaries in a plain test, so the read itself
 * (readEnvVar/isProdBuild above) stays a thin, untested wrapper, matching
 * the same glue-code shape already used elsewhere in this codebase.
 */
export function resolveAppUrl(params: {
  varName: string;
  value: string | undefined;
  isProd: boolean;
  devFallback: string;
}): string {
  const { varName, value, isProd, devFallback } = params;
  if (value) return value;

  if (isProd) {
    throw new Error(`Configuration error: ${varName} is not set`);
  }

  return devFallback;
}

/** The dashboard app's own URL — used by marketing for Sign In / Sign Up / Dashboard links. */
export function getDashboardUrl(): string {
  return resolveAppUrl({
    varName: 'VITE_DASHBOARD_URL',
    value: readEnvVar('VITE_DASHBOARD_URL'),
    isProd: isProdBuild(),
    devFallback: 'http://localhost:3000',
  });
}

/** The API's own base URL — used by dashboard and widget for all HTTP calls. */
export function getApiUrl(): string {
  return resolveAppUrl({
    varName: 'VITE_API_URL',
    value: readEnvVar('VITE_API_URL'),
    isProd: isProdBuild(),
    devFallback: 'http://localhost:4000',
  });
}
