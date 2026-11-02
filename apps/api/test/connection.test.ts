import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { databaseConnection } from '../src/db/connection.ts';

async function caFile(): Promise<string> {
  const path = join(await mkdtemp(join(tmpdir(), 'ca-')), 'rds-ca.pem');
  await writeFile(path, '-----BEGIN CERTIFICATE-----\nTEST\n-----END CERTIFICATE-----\n');
  return path;
}

const aws = async () => ({
  DB_HOST: 'db.internal',
  DB_NAME: 'rentlens',
  DB_USER: 'rentlens_api',
  DB_SECRET_ARN: 'arn:aws:secretsmanager:ap-southeast-1:123456789012:secret:api',
  DB_CA_PATH: await caFile(),
});

describe('databaseConnection', () => {
  it('uses DATABASE_URL when it is set, without reading any secret', async () => {
    const read = () => Promise.reject(new Error('must not be called'));
    await expect(databaseConnection({ DATABASE_URL: 'postgres://u:p@localhost/db' }, read)).resolves.toBe('postgres://u:p@localhost/db');
  });

  it('on AWS, logs in with the password from the role secret, over TLS with the RDS CA', async () => {
    const env = await aws();
    const asked: string[] = [];
    const connection = await databaseConnection(env, async (arn) => {
      asked.push(arn);
      return JSON.stringify({ password: 'from-secret' });
    });
    expect(asked).toEqual([env.DB_SECRET_ARN]);
    expect(connection).toMatchObject({
      host: 'db.internal',
      port: 5432,
      database: 'rentlens',
      user: 'rentlens_api',
      password: 'from-secret',
      ssl: { rejectUnauthorized: true, ca: expect.stringContaining('BEGIN CERTIFICATE') },
    });
  });

  it('accepts a secret that holds the bare password', async () => {
    const connection = await databaseConnection(await aws(), async () => 'bare-password');
    expect(connection).toMatchObject({ password: 'bare-password' });
  });

  it('names every missing setting instead of connecting without TLS or a password', async () => {
    await expect(databaseConnection({ DB_HOST: 'db.internal' }, async () => 'x')).rejects.toThrow(
      'Set DATABASE_URL, or all of: DB_NAME, DB_USER, DB_SECRET_ARN, DB_CA_PATH',
    );
  });
});
