/**
 * analytics-engine/MetricsCalculator.ts
 *
 * Shared pure math utilities used by all metric calculators.
 * No domain logic — just numbers.
 */

export const MetricsCalculator = {

  /** Safe percentage: (n / total) × 100, rounded to 1dp */
  pct(n: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((n / total) * 1000) / 10;
  },

  /** Average of an array. Returns 0 for empty arrays. Does NOT round (preserves decimals). */
  avg(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((a, b) => a + b, 0);
    return Math.round((sum / values.length) * 10) / 10;  // 1dp precision
  },

  /** Percentile from a sorted array. */
  percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))]!;
  },

  /** Insert into sorted array (ascending). */
  sortedInsert(arr: number[], val: number): number[] {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid]! < val) lo = mid + 1;
      else hi = mid;
    }
    const copy = [...arr];
    copy.splice(lo, 0, val);
    return copy;
  },

  /** Top N entries from a frequency map, sorted descending. */
  topN<K extends string>(map: Partial<Record<K, number>>, n: number): Array<{ key: K; count: number }> {
    return (Object.entries(map) as [K, number | undefined][])
      .filter((e): e is [K, number] => e[1] !== undefined)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([key, count]) => ({ key, count }));
  },

  /** Sum all values in a map. */
  sumMap(map: Partial<Record<string, number>>): number {
    return Object.values(map).reduce((a: number, b) => a + (b ?? 0), 0);
  },
};
