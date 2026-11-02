import type { Queryable } from './types.ts';

/** Login roles created by migrations/002_roles.sql, and the variables that hold their passwords. */
export const LOGIN_ROLES = [
  { role: 'rentlens_api', passwordEnv: 'API_DB_PASSWORD' },
  { role: 'rentlens_ingest', passwordEnv: 'INGEST_DB_PASSWORD' },
] as const;

/**
 * Sets a login role's password. ALTER ROLE takes no bind parameters, so Postgres itself quotes
 * the name and the password with format(%I, %L); neither is ever pasted into SQL here.
 */
export async function setRolePassword(db: Queryable, role: string, password: string): Promise<void> {
  if (password.length < 12) throw new Error(`Password for ${role} must be at least 12 characters`);
  const { rows } = await db.query<{ sql: string }>("SELECT format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) AS sql", [role, password]);
  await db.exec(rows[0]!.sql);
}
