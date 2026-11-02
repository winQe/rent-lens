import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, RequestError } from '../src/api.ts';

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('leaves undefined parameters out of the query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await api.streets({ flatType: '4-ROOM', budget: 3000, town: undefined, includeLowData: false, page: 1, pageSize: 12 });
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/streets?flatType=4-ROOM&budget=3000&includeLowData=false&page=1&pageSize=12');
  });

  it('turns a JSON error into a RequestError with the server message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Too many requests' }, { status: 429 })));
    await expect(api.meta()).rejects.toMatchObject({ status: 429, message: 'Too many requests' });
  });

  it('still explains a non-JSON error page with an empty status text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502 })));
    const error = await api.meta().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RequestError);
    expect((error as RequestError).message).toBe('Request failed (HTTP 502)');
  });
});
