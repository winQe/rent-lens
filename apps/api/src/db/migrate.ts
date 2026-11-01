import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Db } from './types.ts';

/** Resolved from the working directory so it works from source (tsx) and from the bundle (dist/). */
export const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? resolve(process.cwd(), 'migrations');

/** Any constant shared by every migration runner; it names the advisory lock. */
const MIGRATION_LOCK = 4_242_001;

/**
 * Applies every .sql file in name order that has not been applied yet, in one transaction.
 * An advisory lock makes a second runner (two setup jobs at once) wait and then find nothing
 * to do, instead of failing on objects the first one created.
 */
export async function migrate(db: Db, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  return db.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    await tx.exec(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`,
    );
    const applied = new Set((await tx.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));

    const ran: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      await tx.exec(await readFile(join(dir, file), 'utf8'));
      await tx.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      ran.push(file);
    }
    return ran;
  });
}
