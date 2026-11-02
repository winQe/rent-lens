import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/types.ts';
import { createApp } from '../src/http/app.ts';
import { createSeededDb, silentLogger } from './helpers.ts';

let db: Db;
beforeAll(async () => {
  db = await createSeededDb();
});
afterAll(() => db.close());

describe('rate limit', () => {
  it('returns 429 with the JSON error shape once the limit is used up', async () => {
    const app = createApp({ db, logger: silentLogger, corsOrigins: [], rateLimitPerMinute: 2 });
    await request(app).get('/api/v1/meta').expect(200);
    await request(app).get('/api/v1/meta').expect(200);
    const res = await request(app).get('/api/v1/meta').expect(429);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body).toEqual({ error: expect.any(String) });
  });
});

describe('CORS', () => {
  const app = () => createApp({ db, logger: silentLogger, corsOrigins: ['http://localhost:5173'] });

  it('allows the configured origin', async () => {
    const res = await request(app()).get('/api/v1/meta').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('sends no CORS header to other origins', async () => {
    const res = await request(app()).get('/api/v1/meta').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('request IDs', () => {
  it('replaces a malformed incoming x-request-id', async () => {
    const app = createApp({ db, logger: silentLogger, corsOrigins: [] });
    const res = await request(app).get('/api/v1/meta').set('x-request-id', 'x'.repeat(500));
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('unexpected errors', () => {
  it('return a generic 500 without the internal message', async () => {
    const broken: Db = {
      query: () => Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:5432 password=hunter2')),
      exec: () => Promise.resolve(),
      transaction: () => Promise.reject(new Error('unused')),
      close: () => Promise.resolve(),
    };
    const app = createApp({ db: broken, logger: silentLogger, corsOrigins: [] });
    for (const path of ['/api/v1/meta', '/healthz']) {
      const res = await request(app).get(path).expect(500);
      expect(res.body).toEqual({ error: 'Internal server error' });
    }
  });
});

describe('database unavailable', () => {
  it('returns a retryable 503 when Postgres refuses connections', async () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED 10.0.0.5:5432'), { code: 'ECONNREFUSED' });
    const down: Db = {
      query: () => Promise.reject(refused),
      exec: () => Promise.resolve(),
      transaction: () => Promise.reject(refused),
      close: () => Promise.resolve(),
    };
    const app = createApp({ db: down, logger: silentLogger, corsOrigins: [] });
    const res = await request(app).get('/api/v1/meta').expect(503);
    expect(res.body).toEqual({ error: 'Database unavailable. Try again shortly.' });
  });
});

describe('GET /api/rent-check errors', () => {
  const app = () => createApp({ db, logger: silentLogger, corsOrigins: [] });

  it('returns 404 when the town has no rentals of that flat type', async () => {
    await request(app()).get('/api/v1/rent-check?flatType=5-ROOM&town=YISHUN&street=YISHUN%20RING%20RD&rent=3000').expect(404);
  });

  it('returns 400 for a rent below the allowed range', async () => {
    const res = await request(app()).get('/api/v1/rent-check?flatType=4-ROOM&town=YISHUN&street=YISHUN%20RING%20RD&rent=50').expect(400);
    expect(res.body.details).toHaveProperty('rent');
  });
});
