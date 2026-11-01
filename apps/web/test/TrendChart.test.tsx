import type { QuarterPoint } from '@rent-lens/shared';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MIN_QUARTER_RENTALS, segments, TrendChart } from '../src/components/TrendChart.tsx';

const q = (quarter: string, streetMedian: number | null, streetRentals: number): QuarterPoint => ({
  quarter,
  streetMedian,
  streetRentals,
  nationalMedian: 3300,
});

describe('TrendChart', () => {
  it('splits a series at missing values', () => {
    expect(segments([1, 2, null, 4, null, null, 7, 8])).toEqual([
      [
        [0, 1],
        [1, 2],
      ],
      [[3, 4]],
      [
        [6, 7],
        [7, 8],
      ],
    ]);
  });

  it('does not plot quarters with too few rentals, and breaks the line there', () => {
    const { container } = render(
      <TrendChart streetLabel="Test St" trend={[q('2026 Q1', 3000, 12), q('2026 Q2', 9999, 1), q('2026 Q3', 3100, 10)]} />,
    );
    const streetLines = container.querySelectorAll('polyline.stroke-plum');
    const streetDots = container.querySelectorAll('circle.fill-plum');
    expect(streetLines).toHaveLength(0);
    expect(streetDots).toHaveLength(2);
    expect(container.textContent).toContain(`Gaps are quarters with fewer than ${MIN_QUARTER_RENTALS} rentals`);
    expect(container.querySelector('svg')?.getAttribute('aria-label')).not.toContain('9,999');
  });
});
