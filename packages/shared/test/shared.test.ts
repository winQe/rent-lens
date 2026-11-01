import { describe, expect, it } from 'vitest';
import { normalizeFlatType, rentCheckQuery, streetsQuery, toDisplayName } from '../src/index.ts';

describe('normalizeFlatType', () => {
  it('accepts both HDB spellings', () => {
    expect(normalizeFlatType('4-ROOM')).toBe('4-ROOM');
    expect(normalizeFlatType('4 ROOM')).toBe('4-ROOM');
    expect(normalizeFlatType(' executive ')).toBe('EXECUTIVE');
  });

  it('rejects unknown types', () => {
    expect(normalizeFlatType('MULTI-GENERATION')).toBeNull();
    expect(normalizeFlatType('')).toBeNull();
  });
});

describe('toDisplayName', () => {
  it('title-cases names with slashes and spaces', () => {
    expect(toDisplayName('KALLANG/WHAMPOA')).toBe('Kallang/Whampoa');
    expect(toDisplayName('BT PANJANG RING RD')).toBe('Bt Panjang Ring Rd');
  });
});

describe('query schemas', () => {
  it('coerces query-string values and applies defaults', () => {
    const q = streetsQuery.parse({ flatType: '4-ROOM', budget: '3000' });
    expect(q).toEqual({ flatType: '4-ROOM', budget: 3000, includeLowData: false, page: 1, pageSize: 12 });
  });

  it('upper-cases town and street names', () => {
    const q = rentCheckQuery.parse({ flatType: '4-ROOM', town: 'yishun', street: 'Yishun Ring Rd', rent: '3400' });
    expect(q.town).toBe('YISHUN');
    expect(q.street).toBe('YISHUN RING RD');
  });

  it('rejects budgets out of range and unknown flat types', () => {
    expect(streetsQuery.safeParse({ flatType: '4-ROOM', budget: '50' }).success).toBe(false);
    expect(streetsQuery.safeParse({ flatType: '7-ROOM', budget: '3000' }).success).toBe(false);
    expect(streetsQuery.safeParse({ flatType: '4-ROOM', budget: '3000', pageSize: '500' }).success).toBe(false);
  });
});
