import { FLAT_TYPES, type FlatType, MIN_RENTALS, type SummaryQuery, type SummaryResponse, type YearOnYear } from '@rent-lens/shared';
import type { Queryable } from '../db/types.ts';
import { dollars, getWindow, WINDOW_CTE } from './common.ts';

const TOP_TOWNS = 5;

/** The latest 12 months (the data window) and the 12 months before it. */
const PERIODS_CTE = `${WINDOW_CTE},
periods AS (
  SELECT
    'current' AS period,
    from_month,
    to_month
  FROM data_window
  UNION ALL
  SELECT
    'previous' AS period,
    (from_month - INTERVAL '12 months')::date AS from_month,
    (from_month - INTERVAL '1 month')::date AS to_month
  FROM data_window
)`;

interface PeriodRow {
  key: string;
  period: 'current' | 'previous';
  rentals: number;
  median: number;
}

/** Rents in the latest 12 months against the 12 months before: per flat type, and per town for one flat type. */
export async function getSummary(db: Queryable, q: SummaryQuery): Promise<SummaryResponse> {
  const window = await getWindow(db);

  const { rows: byFlatType } = await db.query<PeriodRow>(
    `WITH ${PERIODS_CTE}
    SELECT
      r.flat_type AS key,
      periods.period,
      count(*)::int AS rentals,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY r.monthly_rent) AS median
    FROM rental_approval AS r
    INNER JOIN periods
      ON r.approval_month BETWEEN periods.from_month AND periods.to_month
    GROUP BY
      r.flat_type,
      periods.period`,
  );

  const { rows: byTown } = await db.query<PeriodRow>(
    `WITH ${PERIODS_CTE}
    SELECT
      r.town AS key,
      periods.period,
      count(*)::int AS rentals,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY r.monthly_rent) AS median
    FROM rental_approval AS r
    INNER JOIN periods
      ON r.approval_month BETWEEN periods.from_month AND periods.to_month
    WHERE r.flat_type = $1
    GROUP BY
      r.town,
      periods.period`,
    [q.flatType],
  );

  const flatTypes = [...yearOnYear(byFlatType)]
    .map(([flatType, figures]) => ({ flatType: flatType as FlatType, ...figures }))
    .sort((a, b) => FLAT_TYPES.indexOf(a.flatType) - FLAT_TYPES.indexOf(b.flatType));

  const towns = [...yearOnYear(byTown)]
    .map(([town, figures]) => ({ town, ...figures }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.town.localeCompare(b.town))
    .slice(0, TOP_TOWNS);

  return { flatType: q.flatType, window, previousWindow: previousWindow(window), flatTypes, towns };
}

/** Pairs each key's two periods, keeping only keys with at least MIN_RENTALS rentals in both. */
function yearOnYear(rows: PeriodRow[]): Map<string, YearOnYear> {
  const result = new Map<string, YearOnYear>();
  for (const current of rows) {
    if (current.period !== 'current') continue;
    const previous = rows.find((r) => r.key === current.key && r.period === 'previous');
    if (!previous || current.rentals < MIN_RENTALS || previous.rentals < MIN_RENTALS) continue;
    const median = dollars(current.median);
    const previousMedian = dollars(previous.median);
    // Four decimals: enough for a percentage with one decimal, and free of float noise (0.08, not 0.0800000001).
    result.set(current.key, {
      rentals: current.rentals,
      median,
      previousMedian,
      change: Math.round((median / previousMedian - 1) * 10_000) / 10_000,
    });
  }
  return result;
}

function previousWindow(window: SummaryResponse['window']): SummaryResponse['window'] {
  const shift = (yyyyMm: string, months: number) => {
    const [year, month] = yyyyMm.split('-').map(Number);
    const date = new Date(Date.UTC(year!, month! - 1 + months, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  };
  return { fromMonth: shift(window.fromMonth, -12), toMonth: shift(window.fromMonth, -1) };
}
