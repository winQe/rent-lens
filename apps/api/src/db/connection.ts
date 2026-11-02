import { readFile } from 'node:fs/promises';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import type { Connection } from './pg.ts';

/** Reads a secret's value. A parameter, so tests can pass a fake instead of calling AWS. */
export type SecretReader = (secretArn: string) => Promise<string>;

export const readSecret: SecretReader = async (secretArn) => {
  const { SecretString } = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: secretArn }));
  if (!SecretString) throw new Error(`Secret ${secretArn} has no value yet; run the first-deploy provisioning`);
  return SecretString;
};

/**
 * Where the database is and how to log in.
 *
 * - Locally and in Docker: DATABASE_URL.
 * - On AWS: DB_HOST, DB_NAME and DB_USER, plus the password from the role's Secrets Manager secret
 *   (DB_SECRET_ARN), over TLS checked against the RDS CA bundle (DB_CA_PATH). RDS for Postgres 15
 *   and later refuses connections without TLS.
 *
 * The secret holds `{"password": "..."}` (the format RDS uses for its own secrets) or the bare password.
 */
export async function databaseConnection(env: NodeJS.ProcessEnv = process.env, read: SecretReader = readSecret): Promise<Connection> {
  if (env.DATABASE_URL) return env.DATABASE_URL;

  const missing = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_SECRET_ARN', 'DB_CA_PATH'].filter((name) => !env[name]);
  if (missing.length > 0) throw new Error(`Set DATABASE_URL, or all of: ${missing.join(', ')}`);

  return {
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 5432),
    database: env.DB_NAME,
    user: env.DB_USER,
    password: passwordFrom(await read(env.DB_SECRET_ARN!)),
    ssl: { ca: await readFile(env.DB_CA_PATH!, 'utf8'), rejectUnauthorized: true },
  };
}

function passwordFrom(secret: string): string {
  try {
    const parsed: unknown = JSON.parse(secret);
    if (parsed && typeof parsed === 'object' && 'password' in parsed && typeof parsed.password === 'string') return parsed.password;
  } catch {
    // Not JSON: the secret is the bare password.
  }
  return secret;
}
