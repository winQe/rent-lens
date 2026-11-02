import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/types.ts';
import { createApp } from '../src/http/app.ts';
import { createSeededDb, createTestDb, silentLogger } from './helpers.ts';

// The fixture is small enough to work out every number by hand; see test/fixtures/rentals.csv.
// Window: 2025-10 to 2026-09 (12 months ending at the newest month in the data).
let db: Db;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  db = await createSeededDb();
  app = createApp({ db, logger: silentLogger, corsOrigins: ['http://localhost:5173'] });
});
afterAll(() => db.close());

describe('GET /api/meta', () => {
  it('reports the window and row count', async () => {
    const res = await request(app).get('/api/v1/meta').expect(200);
    expect(res.body).toMatchObject({ window: { fromMonth: '2025-10', toMonth: '2026-09' }, rowCount: 39, source: 'fixture' });
  });
});

describe('GET /api/towns', () => {
  it('counts rentals within budget per town, inside the window only', async () => {
    const res = await request(app).get('/api/v1/towns?flatType=4-ROOM&budget=3000').expect(200);
    expect(res.body.towns).toEqual([
      { town: 'TAMPINES', rentals: 10, withinBudget: 0, share: 0, lowData: false },
      { town: 'WOODLANDS', rentals: 10, withinBudget: 8, share: 0.8, lowData: false },
      { town: 'YISHUN', rentals: 15, withinBudget: 8, share: 8 / 15, lowData: false },
    ]);
  });
});

describe('GET /api/streets', () => {
  it('ranks by share within budget and hides low-data streets by default', async () => {
    const res = await request(app).get('/api/v1/streets?flatType=4-ROOM&budget=3000').expect(200);
    expect(res.body).toMatchObject({ total: 3, fitCount: 2, lowDataCount: 1, page: 1 });
    expect(res.body.items.map((s: { street: string }) => s.street)).toEqual(['MARSILING DR', 'YISHUN RING RD', 'TAMPINES ST 81']);
    expect(res.body.items[1]).toEqual({
      town: 'YISHUN',
      street: 'YISHUN RING RD',
      rentals: 12,
      withinBudget: 6,
      share: 0.5,
      p25: 2950,
      median: 3050,
      p75: 3325,
      lowData: false,
    });
  });

  it('includes low-data streets when asked, flagged', async () => {
    const res = await request(app).get('/api/v1/streets?flatType=4-ROOM&budget=3000&includeLowData=true').expect(200);
    // YISHUN ST 20 fits (2 of 3) and so counts in fitCount, but it sorts after every well-sampled street.
    expect(res.body).toMatchObject({ total: 4, fitCount: 3, lowDataCount: 1 });
    expect(res.body.items.map((s: { street: string }) => s.street)).toEqual(['MARSILING DR', 'YISHUN RING RD', 'TAMPINES ST 81', 'YISHUN ST 20']);
    expect(res.body.items[3]).toMatchObject({ rentals: 3, withinBudget: 2, lowData: true });
  });

  it('filters by town and paginates', async () => {
    const town = await request(app).get('/api/v1/streets?flatType=4-ROOM&budget=3000&town=yishun').expect(200);
    expect(town.body.items.map((s: { street: string }) => s.street)).toEqual(['YISHUN RING RD']);

    const page2 = await request(app).get('/api/v1/streets?flatType=4-ROOM&budget=3000&pageSize=1&page=2').expect(200);
    expect(page2.body).toMatchObject({ page: 2, pageSize: 1, total: 3 });
    expect(page2.body.items.map((s: { street: string }) => s.street)).toEqual(['YISHUN RING RD']);

    const pastEnd = await request(app).get('/api/v1/streets?flatType=4-ROOM&budget=3000&page=99').expect(200);
    expect(pastEnd.body).toMatchObject({ total: 3, items: [] });
  });

  it('rejects invalid parameters with 400 and field errors', async () => {
    const res = await request(app).get('/api/v1/streets?flatType=9-ROOM&budget=abc').expect(400);
    expect(Object.keys(res.body.details)).toEqual(expect.arrayContaining(['flatType', 'budget']));
  });

  it('rejects a NUL byte in a name with 400, not a database error', async () => {
    const res = await request(app).get('/api/v1/streets?flatType=4-ROOM&budget=3000&town=%00').expect(400);
    expect(res.body.details).toHaveProperty('town');
  });
});

describe('GET /api/streets/detail', () => {
  it('returns stats, histogram and quarterly trend', async () => {
    const res = await request(app).get('/api/v1/streets/detail?flatType=4-ROOM&town=YISHUN&street=YISHUN%20RING%20RD').expect(200);
    expect(res.body).toMatchObject({ rentals: 12, blocks: 3, p25: 2950, median: 3050, p75: 3325, townMedian: 3000, lowData: false });
    expect(res.body.histogram.map((b: { count: number }) => b.count)).toEqual([1, 0, 1, 0, 1, 4, 2, 2, 0, 1]);
    expect(res.body.trend).toHaveLength(8);
    expect(res.body.trend.slice(-5)).toEqual([
      { quarter: '2025 Q3', streetMedian: 1000, streetRentals: 1, nationalMedian: 1000 },
      { quarter: '2025 Q4', streetMedian: 2500, streetRentals: 3, nationalMedian: 2800 },
      { quarter: '2026 Q1', streetMedian: 3000, streetRentals: 3, nationalMedian: 3000 },
      { quarter: '2026 Q2', streetMedian: 3200, streetRentals: 3, nationalMedian: 3150 },
      { quarter: '2026 Q3', streetMedian: 3500, streetRentals: 3, nationalMedian: 3450 },
    ]);
    expect(res.body.trend[0]).toEqual({ quarter: '2024 Q4', streetMedian: null, streetRentals: 0, nationalMedian: null });
  });

  it('ends the trend at the last complete quarter', async () => {
    // Data up to October: 2026 Q4 holds one month only, so the newest point stays 2026 Q3.
    const partial = await createSeededDb();
    await partial.exec(`update dataset_meta set latest_month = '2026-10-01'`);
    const partialApp = createApp({ db: partial, logger: silentLogger, corsOrigins: [] });
    const res = await request(partialApp).get('/api/v1/streets/detail?flatType=4-ROOM&town=YISHUN&street=YISHUN%20RING%20RD').expect(200);
    expect(res.body.trend.at(-1).quarter).toBe('2026 Q3');
    expect(res.body.trend).toHaveLength(8);
    await partial.close();
  });

  it('returns 404 for a street with no rentals', async () => {
    await request(app).get('/api/v1/streets/detail?flatType=4-ROOM&town=YISHUN&street=NOWHERE%20RD').expect(404);
  });
});

describe('GET /api/rent-check', () => {
  it('compares with the street when it has enough rentals', async () => {
    const res = await request(app).get('/api/v1/rent-check?flatType=4-ROOM&town=YISHUN&street=YISHUN%20RING%20RD&rent=3400').expect(200);
    expect(res.body).toMatchObject({
      comparedWith: 'street',
      rentals: 12,
      lower: 9,
      equal: 1,
      shareLower: 0.75,
      p25: 2950,
      p75: 3325,
      verdict: 'above',
      lowData: false,
    });
  });

  it('falls back to the town when the street has fewer than 10 rentals', async () => {
    const res = await request(app).get('/api/v1/rent-check?flatType=4-ROOM&town=YISHUN&street=YISHUN%20ST%2020&rent=3000').expect(200);
    expect(res.body).toMatchObject({ comparedWith: 'town', rentals: 15, lower: 4, equal: 4, p25: 2950, p75: 3250, verdict: 'usual', lowData: false });
  });

  it('flags a weak verdict when even the town has fewer than 10 rentals', async () => {
    const res = await request(app).get('/api/v1/rent-check?flatType=3-ROOM&town=YISHUN&street=YISHUN%20RING%20RD&rent=2350').expect(200);
    expect(res.body).toMatchObject({ comparedWith: 'town', rentals: 2, lowData: true });
  });
});

describe('known limitations, fixed', () => {
  it('reads each request inside one repeatable-read, read-only transaction', async () => {
    const statements: string[] = [];
    let transactions = 0;
    const spy: Db = {
      ...db,
      transaction: (fn) => {
        transactions++;
        return db.transaction((tx) =>
          fn({
            query: (text, params) => {
              statements.push(text);
              return tx.query(text, params);
            },
            exec: tx.exec,
          }),
        );
      },
    };
    const spyApp = createApp({ db: spy, logger: silentLogger, corsOrigins: [] });
    await request(spyApp).get('/api/v1/streets?flatType=4-ROOM&budget=3000').expect(200);
    expect(transactions).toBe(1);
    // The window and the statistics then come from the same snapshot, even if a load commits in between.
    expect(statements[0]).toBe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    expect(statements.length).toBeGreaterThan(2);
  });

  it('returns 404 from the rent check for a street with no rentals, as the street page does', async () => {
    const res = await request(app).get('/api/v1/rent-check?flatType=4-ROOM&town=YISHUN&street=NOWHERE%20RD&rent=3000').expect(404);
    expect(res.body.error).toMatch(/No rentals for this street/);
  });

  it('says plainly when a parameter is given more than once', async () => {
    for (const query of ['budget=1000&budget=2000', 'budget[]=3000']) {
      const res = await request(app).get(`/api/v1/streets?flatType=4-ROOM&${query}`).expect(400);
      expect(res.body.details.budget, query).toEqual(['Give this parameter once']);
    }
  });
});

describe('HTTP behaviour', () => {
  it('sets cache, security and request-id headers', async () => {
    const res = await request(app).get('/api/v1/towns?flatType=4-ROOM&budget=3000').set('x-request-id', 'abc-123').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.headers['x-request-id']).toBe('abc-123');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('returns JSON 404 for unknown and unversioned routes', async () => {
    for (const path of ['/api/v1/nope', '/nope', '/api/towns?flatType=4-ROOM&budget=3000']) {
      const res = await request(app).get(path).expect(404);
      expect(res.body).toEqual({ error: 'Not found' });
    }
  });

  it('returns 503 before any data is loaded', async () => {
    const empty = await createTestDb();
    const emptyApp = createApp({ db: empty, logger: silentLogger, corsOrigins: [] });
    await request(emptyApp).get('/api/v1/towns?flatType=4-ROOM&budget=3000').expect(503);
    await empty.close();
  });
});
