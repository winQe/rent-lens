import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { Db } from '../src/db/types.ts';
import { createFetchHandler } from '../src/lambda/fetch.ts';
import { createLoadHandler } from '../src/lambda/load.ts';
import { createTestDb, FIXTURE } from './helpers.ts';

describe('fetch Lambda', () => {
  it('stores the downloaded dataset at the configured S3 key', async () => {
    const puts: Array<[string, string, string]> = [];
    const handler = createFetchHandler({
      download: async () => 'csv,body\n',
      put: async (bucket, key, body) => {
        puts.push([bucket, key, body]);
      },
      bucket: 'data-bucket',
      key: 'rentals/latest.csv',
    });
    await expect(handler()).resolves.toEqual({ bucket: 'data-bucket', key: 'rentals/latest.csv', bytes: 9 });
    expect(puts).toEqual([['data-bucket', 'rentals/latest.csv', 'csv,body\n']]);
  });

  it('stores nothing when the download fails', async () => {
    let stored = false;
    const handler = createFetchHandler({
      download: () => Promise.reject(new Error('HTTP 503')),
      put: async () => {
        stored = true;
      },
      bucket: 'b',
      key: 'k',
    });
    await expect(handler()).rejects.toThrow('HTTP 503');
    expect(stored).toBe(false);
  });
});

describe('load Lambda', () => {
  // The fixture has one deliberately bad row in 40 (2.5%), over the default 1% reject limit, so these
  // tests load it without that row.
  const goodRows = async () =>
    (await readFile(FIXTURE, 'utf8'))
      .split('\n')
      .filter((line) => !line.endsWith(',abc'))
      .join('\n');

  async function run(event: Parameters<ReturnType<typeof createLoadHandler>>[0]) {
    const db = await createTestDb();
    let closed = false;
    const read: Array<[string, string]> = [];
    const handler = createLoadHandler({
      getObject: async (bucket, key) => {
        read.push([bucket, key]);
        return goodRows();
      },
      openDb: async (): Promise<Db> => ({
        ...db,
        close: async () => {
          closed = true;
        },
      }),
      defaultBucket: 'default-bucket',
      defaultKey: 'rentals/latest.csv',
    });
    const summary = await handler(event);
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM rental_approval');
    await db.close();
    return { summary, read, closed, count: rows[0]!.n };
  }

  it('loads the object named in the S3 notification, then closes the connection', async () => {
    const result = await run({ Records: [{ s3: { bucket: { name: 'data-bucket' }, object: { key: 'rentals/latest+copy.csv' } } }] });
    expect(result.read).toEqual([['data-bucket', 'rentals/latest copy.csv']]);
    expect(result.count).toBe(39);
    expect(result.summary).toMatchObject({ rowCount: 39, source: 'data.gov.sg' });
    expect(result.closed).toBe(true);
  });

  it('falls back to the configured bucket and key when started without an S3 event', async () => {
    const result = await run({});
    expect(result.read).toEqual([['default-bucket', 'rentals/latest.csv']]);
  });
});
