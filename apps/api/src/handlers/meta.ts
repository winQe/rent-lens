import type { MetaResponse } from '@rent-lens/shared';
import type { Queryable } from '../db/types.ts';
import { getWindow } from './common.ts';

export async function getMeta(db: Queryable): Promise<MetaResponse> {
  const window = await getWindow(db);
  const { rows } = await db.query<{ row_count: number; loaded_at: string; source: string }>(
    `SELECT
      row_count,
      to_char(loaded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS loaded_at,
      source
    FROM dataset_meta`,
  );
  const meta = rows[0]!;
  return { window, rowCount: meta.row_count, loadedAt: meta.loaded_at, source: meta.source };
}
