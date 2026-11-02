import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ingest } from '../src/ingest/ingest.ts';
import { createTestDb, FIXTURE, silentLogger } from './helpers.ts';

const HEADER = 'rent_approval_date,town,block,street_name,flat_type,monthly_rent';
const tolerant = { maxRejectShare: 0.05 }; // the fixture has one deliberately bad row in 40

describe('ingest', () => {
  it('falls back to the snapshot when the download fails and the database is empty', async () => {
    const db = await createTestDb();
    const result = await ingest(db, silentLogger, { download: () => Promise.reject(new Error('HTTP 429')), fallbackFile: FIXTURE, ...tolerant });
    expect(result).toMatchObject({ rowCount: 39, latestMonth: '2026-09', source: 'bundled snapshot' });
    await db.close();
  });

  it('falls back to the snapshot when an empty database gets an unusable download', async () => {
    const db = await createTestDb();
    const result = await ingest(db, silentLogger, { download: async () => '<html>maintenance</html>', fallbackFile: FIXTURE, ...tolerant });
    expect(result.source).toBe('bundled snapshot');
    await db.close();
  });

  it('never replaces loaded data with the snapshot when the download fails', async () => {
    const db = await createTestDb();
    await ingest(db, silentLogger, { file: FIXTURE, ...tolerant });
    await expect(
      ingest(db, silentLogger, { download: () => Promise.reject(new Error('HTTP 503')), fallbackFile: FIXTURE, ...tolerant }),
    ).rejects.toThrow(/HTTP 503/);
    await db.close();
  });

  it('is safe to re-run: the table is replaced, not appended', async () => {
    const db = await createTestDb();
    await ingest(db, silentLogger, { file: FIXTURE, ...tolerant });
    await ingest(db, silentLogger, { file: FIXTURE, ...tolerant });
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM rental_approval');
    expect(rows[0]?.n).toBe(39);
    await db.close();
  });

  it('refuses data older than what is loaded', async () => {
    const db = await createTestDb();
    await ingest(db, silentLogger, { file: FIXTURE, ...tolerant });
    const older = (await readFile(FIXTURE, 'utf8')).replaceAll('2026-09', '2026-08');
    await expect(ingest(db, silentLogger, { download: async () => older, ...tolerant })).rejects.toThrow(/older than the loaded data/);
    await db.close();
  });

  it('refuses a load that drops more than 20% of the rows', async () => {
    const db = await createTestDb();
    await ingest(db, silentLogger, { file: FIXTURE, ...tolerant });
    const lines = (await readFile(FIXTURE, 'utf8')).trim().split('\n');
    const truncated = [lines[0], ...lines.slice(1, 25), lines.find((l) => l.startsWith('2026-09'))].join('\n');
    await expect(ingest(db, silentLogger, { download: async () => truncated, ...tolerant })).rejects.toThrow(/drops from 39 to/);
    await db.close();
  });

  it('loads older data when forced', async () => {
    const db = await createTestDb();
    await ingest(db, silentLogger, { file: FIXTURE, ...tolerant });
    const older = (await readFile(FIXTURE, 'utf8')).replaceAll('2026-09', '2026-08');
    await expect(ingest(db, silentLogger, { download: async () => older, force: true, ...tolerant })).resolves.toMatchObject({
      latestMonth: '2026-08',
    });
    await db.close();
  });

  it('still succeeds when VACUUM fails after the data is committed', async () => {
    const db = await createTestDb();
    const failingVacuum = { ...db, exec: (sql: string) => (sql.startsWith('VACUUM') ? Promise.reject(new Error('vacuum failed')) : db.exec(sql)) };
    await expect(ingest(failingVacuum, silentLogger, { file: FIXTURE, ...tolerant })).resolves.toMatchObject({ rowCount: 39 });
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM rental_approval');
    expect(rows[0]!.n).toBe(39);
    await db.close();
  });

  it('refuses to load when too many rows are rejected', async () => {
    const db = await createTestDb();
    const csv = `${HEADER}\n2026-01,YISHUN,1,A ST,4-ROOM,3000\n2026-01,YISHUN,1,A ST,4-ROOM,oops\n`;
    await expect(ingest(db, silentLogger, { download: async () => csv })).rejects.toThrow(/Rejected 1 of 2/);
    await db.close();
  });
});
