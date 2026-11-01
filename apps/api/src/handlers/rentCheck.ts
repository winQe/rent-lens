import { MIN_RENTALS, type RentCheckQuery, type RentCheckResponse, WINDOW_MONTHS } from '@rent-lens/shared';
import type { Queryable } from '../db/types.ts';
import { dollars, getWindow, HttpError, IN_WINDOW, WINDOW_CTE } from './common.ts';
import { verdict } from './stats.ts';

interface Comparison {
  rentals: number;
  lower: number;
  equal: number;
  p25: number | null;
  p75: number | null;
}

/**
 * Compares a rent with approved rents on the same street. If the street has fewer
 * than MIN_RENTALS rentals, falls back to the whole town and says so. There is no
 * block level: most blocks have only 1 or 2 rentals a year.
 */
export async function checkRent(db: Queryable, q: RentCheckQuery): Promise<RentCheckResponse> {
  await getWindow(db);
  let comparedWith: RentCheckResponse['comparedWith'] = 'street';
  let c = await compare(db, q, q.street);
  if (c.rentals < MIN_RENTALS) {
    comparedWith = 'town';
    c = await compare(db, q, null);
  }
  if (c.rentals === 0) throw new HttpError(404, `No rentals for this town and flat type in the last ${WINDOW_MONTHS} months`);

  const p25 = dollars(c.p25);
  const p75 = dollars(c.p75);
  return {
    flatType: q.flatType,
    rent: q.rent,
    comparedWith,
    town: q.town,
    street: q.street,
    rentals: c.rentals,
    lower: c.lower,
    equal: c.equal,
    shareLower: c.lower / c.rentals,
    p25,
    p75,
    verdict: verdict(q.rent, p25, p75),
    lowData: c.rentals < MIN_RENTALS,
  };
}

async function compare(db: Queryable, q: RentCheckQuery, street: string | null): Promise<Comparison> {
  const { rows } = await db.query<Comparison>(
    `WITH ${WINDOW_CTE}
    SELECT
      count(*)::int AS rentals,
      (count(*) FILTER (WHERE r.monthly_rent < $4))::int AS lower,
      (count(*) FILTER (WHERE r.monthly_rent = $4))::int AS equal,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY r.monthly_rent) AS p25,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY r.monthly_rent) AS p75
    FROM rental_approval AS r
    CROSS JOIN data_window
    WHERE
      r.flat_type = $1
      AND r.town = $2
      AND ($3::text IS NULL OR r.street_name = $3)
      AND ${IN_WINDOW}`,
    [q.flatType, q.town, street, q.rent],
  );
  return rows[0]!;
}
