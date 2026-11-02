import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../src/db/migrate.ts';
import { createPgDb } from '../src/db/pg.ts';
import type { Db } from '../src/db/types.ts';
import { replaceRentals } from '../src/ingest/load.ts';
import { parseRentalCsv } from '../src/ingest/parse.ts';
import { readCsvFile } from '../src/ingest/source.ts';

// The full dataset, so each load takes seconds and the two really overlap (the 40-row fixture
// finishes before the second load starts, and the test then passes even without the lock).
const SNAPSHOT = fileURLToPath(new URL('../../../data/rentals-snapshot.csv.gz', import.meta.url));

// Two overlapping loads need two real connections, which PGlite cannot give. This runs against
// a real Postgres when DATABASE_URL is set (for example the docker compose db), in a throwaway
// database so the app's data is untouched.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)('overlapping loads (real Postgres)', () => {
  const name = `rentlens_test_${process.pid}_${Date.now()}`;
  let admin: pg.Client;
  let a: Db;
  let b: Db;

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    await admin.query(`create database ${name}`);
    const testUrl = new URL(url!);
    testUrl.pathname = `/${name}`;
    a = createPgDb(testUrl.toString(), { maxConnections: 1 });
    b = createPgDb(testUrl.toString(), { maxConnections: 1 });
    await migrate(a);
  });

  afterAll(async () => {
    await a?.close();
    await b?.close();
    await admin?.query(`drop database if exists ${name}`);
    await admin?.end();
  });

  it('leaves exactly one copy of the data', { timeout: 120_000 }, async () => {
    const parsed = parseRentalCsv(await readCsvFile(SNAPSHOT));
    await Promise.all([replaceRentals(a, parsed.rows, parsed.rejected, 'test'), replaceRentals(b, parsed.rows, parsed.rejected, 'test')]);
    const { rows } = await a.query<{ n: number }>('SELECT count(*)::int AS n FROM rental_approval');
    expect(rows[0]?.n).toBe(parsed.rows.length);
  });
});
