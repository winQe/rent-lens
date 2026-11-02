import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadDataset } from '../src/ingest/source.ts';

const poll = () => Response.json({ code: 0, data: { url: 'https://example.invalid/rentals.csv' } });

afterEach(() => vi.useRealTimers());

describe('downloadDataset', () => {
  it('polls for the signed URL, then downloads the CSV', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(poll()).mockResolvedValueOnce(new Response('a,b\n1,2\n'));
    await expect(downloadDataset(fetchImpl)).resolves.toBe('a,b\n1,2\n');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries 429 and network errors with backoff, then succeeds', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(poll())
      .mockResolvedValueOnce(new Response('csv'));
    const result = downloadDataset(fetchImpl);
    await vi.runAllTimersAsync();
    await expect(result).resolves.toBe('csv');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('does not retry a 404, and keeps the signed URL out of the error', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(poll())
      .mockResolvedValueOnce(new Response('', { status: 404 }));
    const error = await downloadDataset(fetchImpl).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('HTTP 404 from data.gov.sg');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('gives up after 4 attempts', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockImplementation(async () => new Response('', { status: 503 }));
    const result = downloadDataset(fetchImpl).catch((e: Error) => e);
    await vi.runAllTimersAsync();
    expect(((await result) as Error).message).toBe('HTTP 503 from data.gov.sg');
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it('fails when poll-download returns an error code', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json({ code: 17, errMsg: 'dataset not found' }));
    await expect(downloadDataset(fetchImpl)).rejects.toThrow(/dataset not found/);
  });
});
