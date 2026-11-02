import { type DataWindow, WINDOW_MONTHS } from '@rent-lens/shared';
import type { Queryable } from '../db/types.ts';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Every statistic covers the latest WINDOW_MONTHS months present in the data
 * (inclusive), anchored on dataset_meta.latest_month rather than today's date.
 */
export const WINDOW_CTE = `data_window AS (
  SELECT
    (latest_month - INTERVAL '${WINDOW_MONTHS - 1} months')::date AS from_month,
    latest_month AS to_month
  FROM dataset_meta
)`;

/** Filter for rental_approval AS r, joined with data_window. */
export const IN_WINDOW = 'r.approval_month BETWEEN data_window.from_month AND data_window.to_month';

export async function getWindow(db: Queryable): Promise<DataWindow> {
  const { rows } = await db.query<{ from_month: string; to_month: string }>(
    `WITH ${WINDOW_CTE}
    SELECT
      to_char(from_month, 'YYYY-MM') AS from_month,
      to_char(to_month, 'YYYY-MM') AS to_month
    FROM data_window`,
  );
  const row = rows[0];
  if (!row) throw new HttpError(503, 'No data loaded yet. Run the ingest job.');
  return { fromMonth: row.from_month, toMonth: row.to_month };
}

/** percentile_cont returns fractional dollars (e.g. 2962.5); show whole dollars. */
export const dollars = (value: number | string | null): number => Math.round(Number(value ?? 0));
