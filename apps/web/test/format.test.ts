import { describe, expect, it } from 'vitest';
import { inTen, inTenLabel, money, monthLabel, percent, shareStep, signedPercent, topTowns } from '../src/format.ts';

describe('format', () => {
  it('formats money, shares and months', () => {
    expect(money(3000)).toBe('S$3,000');
    expect(percent(0.7407)).toBe('74%');
    expect(inTen(0.7407)).toBe(7);
  });

  it('rounds "in 10" down, so it never disagrees with the 50% fit rule', () => {
    expect(inTen(0.46)).toBe(4);
    expect(inTen(0.5)).toBe(5);
    expect(inTen(14 / 20)).toBe(7);
    expect(inTen(1)).toBe(10);
    expect(inTenLabel(3 / 67)).toBe('Under 1 in 10');
    expect(inTenLabel(0)).toBe('0 in 10');
    expect(inTenLabel(0.464)).toBe('4 in 10');
  });

  it('signs every change, so its direction never depends on colour', () => {
    expect([0.08, -0.05, 0.004, -0.004, 0].map(signedPercent)).toEqual(['+8%', '-5%', '0%', '0%', '0%']);
  });

  it('picks the five best towns with enough rentals, best first', () => {
    const row = (town: string, share: number, lowData = false) => ({ town, rentals: 100, withinBudget: share * 100, share, lowData });
    const towns = [row('A', 0.1), row('B', 0.9, true), row('C', 0.5), row('D', 0.3), row('E', 0.7), row('F', 0.2), row('G', 0.6)];
    expect(topTowns(towns).map((t) => t.town)).toEqual(['E', 'G', 'C', 'D', 'F']);
  });

  it('breaks ties in top towns by number of rentals', () => {
    const row = (town: string, rentals: number) => ({ town, rentals, withinBudget: rentals, share: 1, lowData: false });
    expect(topTowns([row('ANG MO KIO', 29), row('BUKIT BATOK', 158), row('CHOA CHU KANG', 10)]).map((t) => t.town)).toEqual([
      'BUKIT BATOK',
      'ANG MO KIO',
      'CHOA CHU KANG',
    ]);
    expect(monthLabel('2025-10')).toBe('Oct 2025');
  });

  it('maps shares to five map steps', () => {
    expect([0, 0.09, 0.1, 0.24, 0.25, 0.49, 0.5, 0.74, 0.75, 1].map(shareStep)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('colours by the rounded percent that the label shows', () => {
    expect(percent(0.496)).toBe('50%');
    expect(shareStep(0.496)).toBe(3);
    expect(percent(0.096)).toBe('10%');
    expect(shareStep(0.096)).toBe(1);
  });
});
