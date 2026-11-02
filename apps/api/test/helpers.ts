import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import { pino } from 'pino';
import { migrate } from '../src/db/migrate.ts';
import type { Db, Queryable } from '../src/db/types.ts';
import { replaceRentals } from '../src/ingest/load.ts';
import { parseRentalCsv } from '../src/ingest/parse.ts';

export const FIXTURE = fileURLToPath(new URL('./fixtures/rentals.csv', import.meta.url));
const MIGRATIONS = fileURLToPath(new URL('../migrations', import.meta.url));

export const silentLogger = pino({ level: 'silent' });

function wrap(q: PGlite | Transaction): Queryable {
  return {
    async query<T>(text: string, params?: unknown[]) {
      return { rows: (await q.query<T>(text, params)).rows };
    },
    async exec(sql: string) {
      await q.exec(sql);
    },
  };
}

/** In-process Postgres (PGlite) with the real migrations applied. */
export async function createTestDb(): Promise<Db> {
  const pg = new PGlite();
  const db: Db = {
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx))),
    close: () => pg.close(),
  };
  await migrate(db, MIGRATIONS);
  return db;
}

export async function createSeededDb(fixture = FIXTURE): Promise<Db> {
  const db = await createTestDb();
  const parsed = parseRentalCsv(await readFile(fixture, 'utf8'));
  await replaceRentals(db, parsed.rows, parsed.rejected, 'fixture');
  return db;
}
