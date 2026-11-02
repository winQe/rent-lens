import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../src/db/types.ts';
import { createApp } from '../src/http/app.ts';
import { createSeededDb, silentLogger } from './helpers.ts';

// test/fixtures/summary.csv: the latest month is 2026-09, so the latest 12 months are 2025-10 to
// 2026-09 and the 12 months before are 2024-10 to 2025-09. Every median below is worked out by hand.
const FIXTURE = fileURLToPath(new URL('./fixtures/summary.csv', import.meta.url));

let db: Db;
let app: ReturnType<typeof createApp>;
beforeAll(async () => {
  db = await createSeededDb(FIXTURE);
  app = createApp({ db, logger: silentLogger, corsOrigins: [] });
});
afterAll(() => db.close());

describe('GET /api/v1/summary', () => {
  it('compares each flat type with the year before, leaving out flat types with too few rentals', async () => {
    const res = await request(app).get('/api/v1/summary?flatType=4-ROOM').expect(200);
    expect(res.body.window).toEqual({ fromMonth: '2025-10', toMonth: '2026-09' });
    expect(res.body.previousWindow).toEqual({ fromMonth: '2024-10', toMonth: '2025-09' });
    // 4-room now: 10 each at 2,400 / 2,550 / 2,850 / 3,000, so the median of 40 is (2,550 + 2,850) / 2.
    // 4-room before: 3 at 1,000, 10 at 2,000, 10 at 2,500, 10 at 3,000, so the 17th of 33 is 2,500.
    // 3-room (2 and 3 rentals) and Executive (1 rental) have fewer than 10 in a period.
    expect(res.body.flatTypes).toEqual([
      { flatType: '4-ROOM', rentals: 40, median: 2700, previousMedian: 2500, change: 0.08 },
      { flatType: '5-ROOM', rentals: 10, median: 3300, previousMedian: 3000, change: 0.1 },
    ]);
  });

  it('lists the towns whose median changed most, largest change first, rising or falling', async () => {
    const res = await request(app).get('/api/v1/summary?flatType=4-ROOM').expect(200);
    // Dover has only 3 rentals the year before, so it is left out.
    expect(res.body.towns).toEqual([
      { town: 'ANG MO KIO', rentals: 10, median: 2400, previousMedian: 2000, change: 0.2 },
      { town: 'BEDOK', rentals: 10, median: 2850, previousMedian: 3000, change: -0.05 },
      { town: 'CLEMENTI', rentals: 10, median: 2550, previousMedian: 2500, change: 0.02 },
    ]);
  });

  it('rejects an unknown flat type', async () => {
    await request(app).get('/api/v1/summary?flatType=9-ROOM').expect(400);
  });
});
