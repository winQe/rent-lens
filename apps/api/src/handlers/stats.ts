import type { HistogramBin, RentVerdict } from '@rent-lens/shared';

/** Fixed-width bins from the lowest to the highest rent, so the chart has no gaps at the ends. */
export function histogram(rents: number[], width = 200): HistogramBin[] {
  if (rents.length === 0) return [];
  const min = Math.min(...rents);
  const max = Math.max(...rents);
  const start = Math.floor(min / width) * width;
  const count = Math.floor((max - start) / width) + 1;
  const bins = Array.from({ length: count }, (_, i) => ({ from: start + i * width, to: start + (i + 1) * width, count: 0 }));
  for (const rent of rents) bins[Math.floor((rent - start) / width)]!.count++;
  return bins;
}

/** "Usual" is the middle half of rents (25th to 75th percentile, inclusive). */
export function verdict(rent: number, p25: number, p75: number): RentVerdict {
  if (rent < p25) return 'below';
  if (rent > p75) return 'above';
  return 'usual';
}
