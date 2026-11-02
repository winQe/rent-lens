import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { parseRentalCsv, SchemaError } from '../src/ingest/parse.ts';
import { FIXTURE } from './helpers.ts';

const HEADER = 'rent_approval_date,town,block,street_name,flat_type,monthly_rent';

describe('parseRentalCsv', () => {
  it('parses valid rows and counts rejects', async () => {
    const result = parseRentalCsv(await readFile(FIXTURE, 'utf8'));
    expect(result.rows).toHaveLength(39);
    expect(result.rejected).toBe(1);
    expect(result.rejectedSamples[0]?.reason).toContain('monthly_rent');
  });

  it('normalises "4 ROOM" to "4-ROOM" and months to dates', () => {
    const csv = 'rent_approval_date,town,block,street_name,flat_type,monthly_rent\n2026-01,woodlands,3,marsiling dr,4 ROOM,2800\n';
    expect(parseRentalCsv(csv).rows[0]).toEqual({
      approvalMonth: '2026-01-01',
      town: 'WOODLANDS',
      block: '3',
      streetName: 'MARSILING DR',
      flatType: '4-ROOM',
      monthlyRent: 2800,
    });
  });

  it('rejects bad months, flat types and rents', () => {
    const csv = [
      'rent_approval_date,town,block,street_name,flat_type,monthly_rent',
      // Month 00 is inside the date range as a string, so only the month pattern can reject it.
      '2026-00,YISHUN,1,A ST,4-ROOM,3000',
      '2026-01,YISHUN,1,A ST,PENTHOUSE,3000',
      '2026-01,YISHUN,1,A ST,4-ROOM,-5',
      '2026-01,YISHUN,1,,4-ROOM,3000',
    ].join('\n');
    const result = parseRentalCsv(csv);
    expect(result.rows).toHaveLength(0);
    expect(result.rejected).toBe(4);
    expect(result.rejectedSamples.map((r) => r.reason)).toEqual([
      'bad rent_approval_date "2026-00"',
      'unknown flat_type "PENTHOUSE"',
      'bad monthly_rent "-5"',
      'missing town, street_name or block',
    ]);
  });

  it('rejects months outside Jan 2021 to the current month, and implausible rents', () => {
    const csv = [
      'rent_approval_date,town,block,street_name,flat_type,monthly_rent',
      '2099-01,YISHUN,1,A ST,4-ROOM,3000',
      '2020-12,YISHUN,1,A ST,4-ROOM,3000',
      '2026-01,YISHUN,1,A ST,4-ROOM,300000',
      '2026-01,YISHUN,1,A ST,4-ROOM,1e3',
      '2026-01,YISHUN,1,A ST,4-ROOM,3000',
    ].join('\n');
    const result = parseRentalCsv(csv);
    expect(result.rejected).toBe(4);
    expect(result.rows.map((r) => r.monthlyRent)).toEqual([3000]);
  });

  it('uses the current month in Singapore time for the upper bound', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T17:00:00Z')); // 1 Oct 2026, 01:00 in Singapore
    try {
      const csv = `${HEADER}\n2026-10,YISHUN,1,A ST,4-ROOM,3000\n2026-11,YISHUN,1,A ST,4-ROOM,3000\n`;
      const result = parseRentalCsv(csv);
      expect(result.rows.map((r) => r.approvalMonth)).toEqual(['2026-10-01']);
      expect(result.rejected).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts whole-dollar rents written with zero cents, and nothing else fractional', () => {
    const csv = `${HEADER}\n2026-01,YISHUN,1,A ST,4-ROOM,2500.00\n2026-01,YISHUN,1,A ST,4-ROOM,2500.50\n2026-01,YISHUN,1,A ST,4-ROOM,"2,500"\n`;
    const result = parseRentalCsv(csv);
    expect(result.rows.map((r) => r.monthlyRent)).toEqual([2500]);
    expect(result.rejected).toBe(2);
  });

  it('counts a row with the wrong number of fields as a reject instead of failing the whole file', () => {
    const csv = `${HEADER}\n2026-01,YISHUN,1,A ST, EXTRA,4-ROOM,3000\n2026-01,YISHUN,1,A ST,4-ROOM\n2026-01,YISHUN,1,A ST,4-ROOM,3000\n`;
    const result = parseRentalCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rejected).toBe(2);
    expect(result.rejectedSamples[0]?.reason).toMatch(/expected 6 fields, got 7/);
  });

  it('fails fast when the source columns change', () => {
    expect(() => parseRentalCsv('month,town,rent\n2026-01,YISHUN,3000\n')).toThrow(SchemaError);
  });
});
