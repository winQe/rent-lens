import { MIN_RENTALS, type TownsQuery, type TownsResponse } from '@rent-lens/shared';
import type { Queryable } from '../db/types.ts';
import { getWindow, IN_WINDOW, WINDOW_CTE } from './common.ts';

/** Share of rentals at or below the budget, per town. Feeds the map and the "top towns" list. */
export async function getTowns(db: Queryable, q: TownsQuery): Promise<TownsResponse> {
  const window = await getWindow(db);
  const { rows } = await db.query<{ town: string; rentals: number; within_budget: number }>(
    `WITH ${WINDOW_CTE}
    SELECT
      r.town,
      count(*)::int AS rentals,
      (count(*) FILTER (WHERE r.monthly_rent <= $2))::int AS within_budget
    FROM rental_approval AS r
    CROSS JOIN data_window
    WHERE
      r.flat_type = $1
      AND ${IN_WINDOW}
    GROUP BY r.town
    ORDER BY r.town`,
    [q.flatType, q.budget],
  );

  return {
    flatType: q.flatType,
    budget: q.budget,
    window,
    towns: rows.map((r) => ({
      town: r.town,
      rentals: r.rentals,
      withinBudget: r.within_budget,
      share: r.within_budget / r.rentals,
      lowData: r.rentals < MIN_RENTALS,
    })),
  };
}
