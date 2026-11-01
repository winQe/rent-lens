import type { Db } from '../db/types.ts';
import type { RentalRow } from './parse.ts';

const BATCH_SIZE = 5000;

/** A new load may not shrink the dataset by more than this share (a truncated or partial source). */
const MAX_ROW_DROP = 0.2;

export interface LoadSummary {
  rowCount: number;
  latestMonth: string;
}

export interface LoadOptions {
  /** Skip the staleness and row-drop guards, for a deliberate reload. */
  force?: boolean;
}

/**
 * Replaces the whole table in one transaction. Readers keep seeing the old data
 * until commit (DELETE, unlike TRUNCATE, does not block them), and re-running
 * with the same file gives the same result, so the job is safe to retry.
 */
export async function replaceRentals(db: Db, rows: RentalRow[], rejected: number, source: string, opts: LoadOptions = {}): Promise<LoadSummary> {
  if (rows.length === 0) throw new Error('Refusing to load an empty dataset');
  // biome-ignore lint/complexity/useMathMinMax: approvalMonth is a 'YYYY-MM-DD' string, and Math.max would turn it into NaN.
  const latestMonth = rows.reduce((max, r) => (r.approvalMonth > max ? r.approvalMonth : max), rows[0]!.approvalMonth);

  await db.transaction(async (tx) => {
    // Serialise loads. Without this, two loads that overlap both DELETE only the rows they can
    // see and both INSERT, leaving every rental twice (reproduced: 425,194 rows instead of 212,597).
    // EXCLUSIVE mode still lets readers query the old data until commit.
    await tx.query('LOCK TABLE rental_approval IN EXCLUSIVE MODE');

    const { rows: current } = await tx.query<{ latest_month: string; row_count: number }>(
      `SELECT
        to_char(latest_month, 'YYYY-MM-DD') AS latest_month,
        row_count
      FROM dataset_meta`,
    );
    const loaded = current[0];
    if (loaded && !opts.force) {
      if (latestMonth < loaded.latest_month) {
        throw new Error(`New data ends ${latestMonth.slice(0, 7)}, older than the loaded data (${loaded.latest_month.slice(0, 7)})`);
      }
      if (rows.length < loaded.row_count * (1 - MAX_ROW_DROP)) {
        throw new Error(`Row count drops from ${loaded.row_count} to ${rows.length}, more than ${MAX_ROW_DROP * 100}%`);
      }
    }

    await tx.query('DELETE FROM rental_approval');
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      // One statement per batch: unnest() turns six arrays into rows, which keeps the
      // parameter count fixed no matter how big the batch is.
      await tx.query(
        `INSERT INTO rental_approval (approval_month, town, block, street_name, flat_type, monthly_rent)
        SELECT
          batch.approval_month,
          batch.town,
          batch.block,
          batch.street_name,
          batch.flat_type,
          batch.monthly_rent
        FROM unnest($1::date[], $2::text[], $3::text[], $4::text[], $5::text[], $6::int[])
          AS batch (approval_month, town, block, street_name, flat_type, monthly_rent)`,
        [
          batch.map((r) => r.approvalMonth),
          batch.map((r) => r.town),
          batch.map((r) => r.block),
          batch.map((r) => r.streetName),
          batch.map((r) => r.flatType),
          batch.map((r) => r.monthlyRent),
        ],
      );
    }
    await tx.query(
      `INSERT INTO dataset_meta (id, latest_month, row_count, rejected_count, loaded_at, source)
      VALUES (TRUE, $1, $2, $3, now(), $4)
      ON CONFLICT (id) DO UPDATE
      SET
        latest_month = excluded.latest_month,
        row_count = excluded.row_count,
        rejected_count = excluded.rejected_count,
        loaded_at = excluded.loaded_at,
        source = excluded.source`,
      [latestMonth, rows.length, rejected, source],
    );
  });

  return { rowCount: rows.length, latestMonth: latestMonth.slice(0, 7) };
}
