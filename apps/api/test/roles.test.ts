import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setRolePassword } from '../src/db/roles.ts';
import type { Db } from '../src/db/types.ts';
import { replaceRentals } from '../src/ingest/load.ts';
import { parseRentalCsv } from '../src/ingest/parse.ts';
import { createSeededDb, FIXTURE } from './helpers.ts';

let db: Db;
beforeAll(async () => {
  db = await createSeededDb();
});
afterAll(() => db.close());

/** Runs fn as the given role, then switches back to the owner. */
async function as<T>(role: string, fn: () => Promise<T>): Promise<T> {
  await db.exec(`SET ROLE ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec('RESET ROLE');
  }
}

describe('database roles', () => {
  it('lets the API role read both tables', async () => {
    const counts = await as('rentlens_api', async () => {
      const rentals = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM rental_approval');
      const meta = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM dataset_meta');
      return [rentals.rows[0]!.n, meta.rows[0]!.n];
    });
    expect(counts).toEqual([39, 1]);
  });

  it('stops the API role from changing any data', async () => {
    for (const sql of [
      'DELETE FROM rental_approval',
      "UPDATE dataset_meta SET source = 'x'",
      "INSERT INTO rental_approval (approval_month, town, block, street_name, flat_type, monthly_rent) VALUES ('2026-01-01', 'A', '1', 'B', '4-ROOM', 1)",
      'DROP TABLE rental_approval',
    ]) {
      await expect(
        as('rentlens_api', () => db.query(sql)),
        sql,
      ).rejects.toThrow(/permission denied|must be owner/);
    }
  });

  it('lets the ingest role run a full load, including the table lock and VACUUM', async () => {
    const parsed = parseRentalCsv(await readFile(FIXTURE, 'utf8'));
    await as('rentlens_ingest', async () => {
      await replaceRentals(db, parsed.rows, parsed.rejected, 'fixture');
      await db.exec('VACUUM ANALYZE rental_approval');
    });
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM rental_approval');
    expect(rows[0]!.n).toBe(39);
  });

  it('stops the ingest role from changing the schema', async () => {
    await expect(as('rentlens_ingest', () => db.exec('DROP TABLE rental_approval'))).rejects.toThrow(/must be owner/);
  });

  it('sets a login password that contains quotes without breaking the SQL', async () => {
    await setRolePassword(db, 'rentlens_api', "it's a long 'quoted' password");
    const { rows } = await db.query<{ has_password: boolean }>(
      "SELECT rolpassword IS NOT NULL AS has_password FROM pg_authid WHERE rolname = 'rentlens_api'",
    );
    expect(rows[0]!.has_password).toBe(true);
  });

  it('refuses a short password', async () => {
    await expect(setRolePassword(db, 'rentlens_api', 'short')).rejects.toThrow(/at least 12 characters/);
  });
});
