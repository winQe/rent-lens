import { requireEnv } from '../config.ts';
import { migrate } from '../db/migrate.ts';
import { createPgDb } from '../db/pg.ts';
import { logger } from '../logger.ts';

const db = createPgDb(requireEnv('DATABASE_URL'), { maxConnections: 1 });
try {
  const ran = await migrate(db);
  logger.info({ ran }, ran.length ? 'applied migrations' : 'schema up to date');
} finally {
  await db.close();
}
