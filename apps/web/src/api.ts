import type {
  ApiError,
  FlatType,
  MetaResponse,
  RentCheckResponse,
  StreetDetailResponse,
  StreetsResponse,
  SummaryResponse,
  TownsResponse,
} from '@rent-lens/shared';

export class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Params = Record<string, string | number | boolean | undefined>;

/**
 * `signal` comes from TanStack Query, which aborts a request when its inputs change or the
 * component unmounts, so a fast-moving slider does not leave stale requests running.
 */
async function get<T>(path: string, params: Params, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const res = await fetch(`/api/v1${path}?${query}`, { signal });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    // A proxy error page is not JSON, and statusText is empty over HTTP/2: fall back to the code.
    throw new RequestError(res.status, body?.error ?? (res.statusText || `Request failed (HTTP ${res.status})`));
  }
  return (await res.json()) as T;
}

export const api = {
  meta: (signal?: AbortSignal) => get<MetaResponse>('/meta', {}, signal),
  towns: (flatType: FlatType, budget: number, signal?: AbortSignal) => get<TownsResponse>('/towns', { flatType, budget }, signal),
  streets: (
    p: { flatType: FlatType; budget: number; town?: string; includeLowData: boolean; page: number; pageSize: number },
    signal?: AbortSignal,
  ) => get<StreetsResponse>('/streets', p, signal),
  streetDetail: (flatType: FlatType, town: string, street: string, signal?: AbortSignal) =>
    get<StreetDetailResponse>('/streets/detail', { flatType, town, street }, signal),
  rentCheck: (flatType: FlatType, town: string, street: string, rent: number, signal?: AbortSignal) =>
    get<RentCheckResponse>('/rent-check', { flatType, town, street, rent }, signal),
  summary: (flatType: FlatType, signal?: AbortSignal) => get<SummaryResponse>('/summary', { flatType }, signal),
};
