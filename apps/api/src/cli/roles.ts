// Sets the passwords of the API and ingest login roles from API_DB_PASSWORD and
// INGEST_DB_PASSWORD. Run after migrate, as the database owner.
import { requireEnv } from '../config.ts';
import { createPgDb } from '../db/pg.ts';
import { LOGIN_ROLES, setRolePassword } from '../db/roles.ts';
import { logger } from '../logger.ts';

const db = createPgDb(requireEnv('DATABASE_URL'), { maxConnections: 1 });
try {
  for (const { role, passwordEnv } of LOGIN_ROLES) {
    await setRolePassword(db, role, requireEnv(passwordEnv));
    logger.info({ role }, 'set login role password');
  }
} finally {
  await db.close();
}
