import { MIN_RENTALS, type StreetDetailQuery, type StreetDetailResponse, WINDOW_MONTHS } from '@rent-lens/shared';
import type { Queryable } from '../db/types.ts';
import { dollars, getWindow, HttpError, IN_WINDOW, WINDOW_CTE } from './common.ts';
import { histogram } from './stats.ts';

const TREND_QUARTERS = 8;

export async function getStreetDetail(db: Queryable, q: StreetDetailQuery): Promise<StreetDetailResponse> {
  const window = await getWindow(db);
  const params = [q.town, q.street, q.flatType];

  const { rows: statRows } = await db.query<{
    rentals: number;
    blocks: number;
    p25: number;
    median: number;
    p75: number;
    rents: number[] | null;
  }>(
    `WITH ${WINDOW_CTE}
    SELECT
      count(*)::int AS rentals,
      count(DISTINCT r.block)::int AS blocks,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY r.monthly_rent) AS p25,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY r.monthly_rent) AS median,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY r.monthly_rent) AS p75,
      array_agg(r.monthly_rent) AS rents
    FROM rental_approval AS r
    CROSS JOIN data_window
    WHERE
      r.town = $1
      AND r.street_name = $2
      AND r.flat_type = $3
      AND ${IN_WINDOW}`,
    params,
  );
  const stats = statRows[0];
  if (!stats || stats.rentals === 0) throw new HttpError(404, `No rentals for this street and flat type in the last ${WINDOW_MONTHS} months`);

  const { rows: townRows } = await db.query<{ median: number }>(
    `WITH ${WINDOW_CTE}
    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY r.monthly_rent) AS median
    FROM rental_approval AS r
    CROSS JOIN data_window
    WHERE
      r.town = $1
      AND r.flat_type = $2
      AND ${IN_WINDOW}`,
    [q.town, q.flatType],
  );

  // Quarterly, not monthly: a single street has too few rentals per month for a stable median.
  // The newest point is the last complete quarter: with data to October, Q4 would hold one month only.
  const { rows: trend } = await db.query<{
    quarter: string;
    street_median: number | null;
    street_rentals: number;
    national_median: number | null;
  }>(
    // LATERAL is the one exception to "CTEs, not subqueries" in this codebase: it runs one index
    // range scan per quarter, so rows arrive grouped. Grouping all 8 quarters in a CTE instead
    // sorts about 27,000 rows and took 6 to 8 ms against about 3 ms on the full dataset.
    `WITH quarters AS (
      SELECT (date_trunc('quarter', latest_month + INTERVAL '1 month') - make_interval(months => 3 * (g + 1)))::date AS quarter_start
      FROM dataset_meta
      CROSS JOIN generate_series(0, ${TREND_QUARTERS - 1}) AS g
    )
    SELECT
      to_char(quarters.quarter_start, 'YYYY "Q"Q') AS quarter,
      street.median AS street_median,
      street.rentals AS street_rentals,
      national.median AS national_median
    FROM quarters
    LEFT JOIN LATERAL (
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY r.monthly_rent) AS median,
        count(*)::int AS rentals
      FROM rental_approval AS r
      WHERE
        r.town = $1
        AND r.street_name = $2
        AND r.flat_type = $3
        AND r.approval_month >= quarters.quarter_start
        AND r.approval_month < quarters.quarter_start + INTERVAL '3 months'
    ) AS street
      ON TRUE
    LEFT JOIN LATERAL (
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY r.monthly_rent) AS median
      FROM rental_approval AS r
      WHERE
        r.flat_type = $3
        AND r.approval_month >= quarters.quarter_start
        AND r.approval_month < quarters.quarter_start + INTERVAL '3 months'
    ) AS national
      ON TRUE
    ORDER BY quarters.quarter_start`,
    params,
  );

  return {
    flatType: q.flatType,
    town: q.town,
    street: q.street,
    window,
    rentals: stats.rentals,
    blocks: stats.blocks,
    p25: dollars(stats.p25),
    median: dollars(stats.median),
    p75: dollars(stats.p75),
    townMedian: dollars(townRows[0]?.median ?? null),
    lowData: stats.rentals < MIN_RENTALS,
    histogram: histogram(stats.rents ?? []),
    trend: trend.map((t) => ({
      quarter: t.quarter,
      streetMedian: t.street_median === null ? null : dollars(t.street_median),
      streetRentals: t.street_rentals,
      nationalMedian: t.national_median === null ? null : dollars(t.national_median),
    })),
  };
}
