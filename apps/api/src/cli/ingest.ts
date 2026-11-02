import { parseArgs } from 'node:util';
import { requireEnv, snapshotPath } from '../config.ts';
import { createPgDb } from '../db/pg.ts';
import { ingest } from '../ingest/ingest.ts';
import { logger } from '../logger.ts';

// Usage:
//   yarn ingest                       download from data.gov.sg; an empty database falls back to the bundled snapshot
//   yarn ingest --file rentals.csv    load a local CSV (or .csv.gz)
//   yarn ingest --if-empty            skip when data is already loaded (used on `docker compose up`)
//   yarn ingest --no-fallback         fail instead of loading the bundled snapshot into an empty database
//   yarn ingest --force               allow a load that is older or much smaller (MAX_ROW_DROP) than the loaded data
const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    file: { type: 'string' },
    'if-empty': { type: 'boolean', default: false },
    'no-fallback': { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
  },
});

const db = createPgDb(requireEnv('DATABASE_URL'), { maxConnections: 1 });
try {
  const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM dataset_meta');
  if (values['if-empty'] && rows[0]?.n) {
    logger.info('data already loaded, skipping ingest');
  } else {
    await ingest(db, logger, {
      file: values.file,
      fallbackFile: values['no-fallback'] ? undefined : snapshotPath(),
      force: values.force,
    });
  }
} catch (err) {
  logger.error({ err }, 'ingest failed');
  process.exitCode = 1;
} finally {
  await db.close();
}
