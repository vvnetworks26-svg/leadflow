/** Safely extract a route param as a plain string. */
export function param(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}
