import { FIT_SHARE, MIN_RENTALS, type StreetsQuery, type StreetsResponse } from '@rent-lens/shared';
import type { Queryable } from '../db/types.ts';
import { dollars, getWindow, IN_WINDOW, WINDOW_CTE } from './common.ts';

interface StreetRow {
  town: string;
  street_name: string;
  rentals: number;
  within_budget: number;
  p25: number;
  median: number;
  p75: number;
}

/**
 * Streets ranked by the share of rents at or below the budget. We rank by share and
 * not by median because owners declare round numbers: on a busy street a third of
 * 4-room rents can be exactly S$3,000, so medians tie everywhere.
 */
export async function getStreets(db: Queryable, q: StreetsQuery): Promise<StreetsResponse> {
  const window = await getWindow(db);
  const { rows } = await db.query<{ total: number; fit_count: number; low_data_count: number; items: StreetRow[] }>(
    `WITH ${WINDOW_CTE},
    street_stats AS (
      SELECT
        r.town,
        r.street_name,
        count(*)::int AS rentals,
        (count(*) FILTER (WHERE r.monthly_rent <= $2))::int AS within_budget,
        percentile_cont(0.25) WITHIN GROUP (ORDER BY r.monthly_rent) AS p25,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY r.monthly_rent) AS median,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY r.monthly_rent) AS p75
      FROM rental_approval AS r
      CROSS JOIN data_window
      WHERE
        r.flat_type = $1
        AND ${IN_WINDOW}
        AND ($3::text IS NULL OR r.town = $3)
      GROUP BY
        r.town,
        r.street_name
    ),
    visible AS (
      SELECT
        town,
        street_name,
        rentals,
        within_budget,
        p25,
        median,
        p75,
        rentals < $5 AS low_data,
        within_budget::float8 / rentals AS share
      FROM street_stats
      WHERE
        $4::boolean
        OR rentals >= $5
    ),
    counts AS (
      SELECT
        count(*)::int AS total,
        (count(*) FILTER (WHERE within_budget >= rentals * $6::float8))::int AS fit_count
      FROM visible
    ),
    low_data_counts AS (
      SELECT count(*)::int AS low_data_count
      FROM street_stats
      WHERE rentals < $5
    ),
    page AS (
      SELECT
        town,
        street_name,
        rentals,
        within_budget,
        p25,
        median,
        p75,
        low_data,
        share
      FROM visible
      -- Low-data streets go last, so a street with 1 rental at 100% does not top the list.
      ORDER BY
        low_data,
        share DESC,
        rentals DESC,
        street_name
      LIMIT $7
      OFFSET $8
    ),
    items AS (
      -- json_agg needs its own ORDER BY: the order of a CTE is not guaranteed to survive aggregation.
      SELECT json_agg(page ORDER BY page.low_data, page.share DESC, page.rentals DESC, page.street_name) AS items
      FROM page
    )
    SELECT
      counts.total,
      counts.fit_count,
      low_data_counts.low_data_count,
      coalesce(items.items, '[]'::json) AS items
    FROM counts
    CROSS JOIN low_data_counts
    CROSS JOIN items`,
    [q.flatType, q.budget, q.town ?? null, q.includeLowData, MIN_RENTALS, FIT_SHARE, q.pageSize, (q.page - 1) * q.pageSize],
  );
  const result = rows[0]!;

  return {
    flatType: q.flatType,
    budget: q.budget,
    window,
    fitCount: result.fit_count,
    lowDataCount: result.low_data_count,
    total: result.total,
    page: q.page,
    pageSize: q.pageSize,
    items: result.items.map((r) => ({
      town: r.town,
      street: r.street_name,
      rentals: r.rentals,
      withinBudget: r.within_budget,
      share: r.within_budget / r.rentals,
      p25: dollars(r.p25),
      median: dollars(r.median),
      p75: dollars(r.p75),
      lowData: r.rentals < MIN_RENTALS,
    })),
  };
}
