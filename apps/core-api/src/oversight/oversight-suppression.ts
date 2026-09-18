/**
 * Small-count suppression (v0.2 Workflow H "H4": "Any cell below 5 is
 * suppressed"), reused for every aggregate cell this domain produces —
 * not just literal counts. A median computed from fewer than 5
 * referrals can itself leak information about a specific referral's
 * timing in a small district, so the same threshold gates a derived
 * statistic's SAMPLE SIZE, not only a raw count field.
 */
export const SUPPRESSION_THRESHOLD = 5;

export interface SuppressibleCount {
  count: number | null;
  suppressed: boolean;
}

export function suppressibleCount(n: number): SuppressibleCount {
  return n < SUPPRESSION_THRESHOLD ? { count: null, suppressed: true } : { count: n, suppressed: false };
}

export interface SuppressibleMedian {
  medianDays: number | null;
  // Sample size is itself withheld when suppressed — exposing the exact
  // small number (e.g. "3 referrals") in a small district can be as
  // identifying as the timing value it would otherwise gate, so this
  // mirrors suppressibleCount's "hide the number, not just the stat"
  // behavior rather than only hiding medianDays.
  sampleSize: number | null;
  suppressed: boolean;
}

export function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function suppressibleMedian(values: number[]): SuppressibleMedian {
  if (values.length < SUPPRESSION_THRESHOLD) {
    return { medianDays: null, sampleSize: null, suppressed: true };
  }
  return { medianDays: medianOf(values), sampleSize: values.length, suppressed: false };
}
