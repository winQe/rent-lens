import { describe, expect, it } from 'vitest';
import { histogram, verdict } from '../src/handlers/stats.ts';

describe('histogram', () => {
  it('covers min to max in fixed-width bins with no empty ends', () => {
    const bins = histogram([2050, 2100, 2399, 2400, 2800]);
    expect(bins).toEqual([
      { from: 2000, to: 2200, count: 2 },
      { from: 2200, to: 2400, count: 1 },
      { from: 2400, to: 2600, count: 1 },
      { from: 2600, to: 2800, count: 0 },
      { from: 2800, to: 3000, count: 1 },
    ]);
  });

  it('handles one value and no values', () => {
    expect(histogram([3000])).toEqual([{ from: 3000, to: 3200, count: 1 }]);
    expect(histogram([])).toEqual([]);
  });
});

describe('verdict', () => {
  it('treats the 25th to 75th percentile, inclusive, as usual', () => {
    expect(verdict(2900, 2950, 3325)).toBe('below');
    expect(verdict(2950, 2950, 3325)).toBe('usual');
    expect(verdict(3325, 2950, 3325)).toBe('usual');
    expect(verdict(3400, 2950, 3325)).toBe('above');
  });
});
