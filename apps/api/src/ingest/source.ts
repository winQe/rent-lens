import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { DATASET_ID } from '@rent-lens/shared';

const POLL_URL = `https://api-open.data.gov.sg/v1/public/api/datasets/${DATASET_ID}/poll-download`;

interface PollResponse {
  code: number;
  data?: { url?: string };
  errMsg?: string;
}

/**
 * data.gov.sg serves full datasets through a two-step flow: poll-download returns a
 * short-lived signed URL, then we fetch the CSV from it. The API rate-limits bursts,
 * so retry with backoff on 429 and 5xx.
 */
export async function downloadDataset(fetchImpl: typeof fetch = fetch): Promise<string> {
  const poll = await withRetry(() => fetchImpl(POLL_URL, { signal: AbortSignal.timeout(30_000) }));
  const body = (await poll.json()) as PollResponse;
  const url = body.data?.url;
  // Never include the whole body: it can carry the signed download URL, which does not belong in logs.
  if (body.code !== 0 || !url) throw new Error(`poll-download failed: code ${body.code}${body.errMsg ? `, ${body.errMsg}` : ''}`);

  const csv = await withRetry(() => fetchImpl(url, { signal: AbortSignal.timeout(120_000) }));
  return csv.text();
}

export async function readCsvFile(path: string): Promise<string> {
  const buf = await readFile(path);
  return path.endsWith('.gz') ? gunzipSync(buf).toString('utf8') : buf.toString('utf8');
}

async function withRetry(call: () => Promise<Response>, attempts = 4): Promise<Response> {
  for (let i = 1; ; i++) {
    let res: Response | undefined;
    let failure: Error | undefined;
    try {
      res = await call();
    } catch (err) {
      failure = err as Error; // network error or timeout: retryable
    }
    if (res?.ok) return res;
    if (res) {
      await res.body?.cancel(); // free the socket before retrying
      // Only the status: the download URL is a signed link and does not belong in logs.
      failure = new Error(`HTTP ${res.status} from data.gov.sg`);
      if (res.status !== 429 && res.status < 500) throw failure;
    }
    if (i >= attempts) throw failure;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** (i - 1)));
  }
}
