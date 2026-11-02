// Lambda, step 1 of the monthly ingest: download the dataset from data.gov.sg and store it in S3.
// Runs outside the VPC (it needs the internet); the new file starts the load Lambda.
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { requireEnv } from '../config.ts';
import { downloadDataset } from '../ingest/source.ts';
import { logger } from '../logger.ts';

export interface FetchDeps {
  download: () => Promise<string>;
  put: (bucket: string, key: string, body: string) => Promise<void>;
  bucket: string;
  key: string;
}

export function createFetchHandler(deps: FetchDeps) {
  return async (): Promise<{ bucket: string; key: string; bytes: number }> => {
    const csv = await deps.download();
    await deps.put(deps.bucket, deps.key, csv);
    const result = { bucket: deps.bucket, key: deps.key, bytes: Buffer.byteLength(csv) };
    logger.info(result, 'stored dataset in S3');
    return result;
  };
}

export const handler = () => {
  const s3 = new S3Client({});
  return createFetchHandler({
    download: () => downloadDataset(),
    put: async (bucket, key, body) => {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: 'text/csv' }));
    },
    bucket: requireEnv('DATA_BUCKET'),
    key: requireEnv('DATA_KEY'),
  })();
};
