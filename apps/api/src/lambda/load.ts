// Lambda, step 2 of the monthly ingest: load the file the fetch Lambda stored in S3 into Postgres.
// Runs inside the VPC, started by the new S3 object, as the rentlens_ingest role.
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { requireEnv } from '../config.ts';
import { databaseConnection } from '../db/connection.ts';
import { createPgDb } from '../db/pg.ts';
import type { Db } from '../db/types.ts';
import { ingest } from '../ingest/ingest.ts';
import { logger } from '../logger.ts';

/** The part of an S3 "object created" notification this handler reads. */
export interface S3Event {
  Records?: Array<{ s3: { bucket: { name: string }; object: { key: string } } }>;
}

export interface LoadDeps {
  getObject: (bucket: string, key: string) => Promise<string>;
  openDb: () => Promise<Db>;
  defaultBucket: string;
  defaultKey: string;
}

export function createLoadHandler(deps: LoadDeps) {
  return async (event: S3Event = {}) => {
    const record = event.Records?.[0];
    const bucket = record?.s3.bucket.name ?? deps.defaultBucket;
    // S3 notifications URL-encode the key, with "+" for spaces.
    const key = record ? decodeURIComponent(record.s3.object.key.replaceAll('+', ' ')) : deps.defaultKey;

    const db = await deps.openDb();
    try {
      // The same checks as a local load: reject bad rows, refuse older or much smaller data.
      const summary = await ingest(db, logger, { download: () => deps.getObject(bucket, key) });
      logger.info({ bucket, key, ...summary }, 'loaded dataset from S3');
      return summary;
    } finally {
      await db.close();
    }
  };
}

export const handler = (event: S3Event) => {
  const s3 = new S3Client({});
  return createLoadHandler({
    getObject: async (bucket, key) => {
      const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      if (!Body) throw new Error(`s3://${bucket}/${key} is empty`);
      return Body.transformToString('utf-8');
    },
    // One connection: the load runs in a single transaction.
    openDb: async () => createPgDb(await databaseConnection(), { maxConnections: 1 }),
    defaultBucket: requireEnv('DATA_BUCKET'),
    defaultKey: requireEnv('DATA_KEY'),
  })(event);
};
