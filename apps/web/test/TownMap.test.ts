import { describe, expect, it } from 'vitest';
import { labelSize } from '../src/components/TownMap.tsx';
import map from '../src/data/planning-areas.json';

const area = (name: string) => map.areas.find((a) => a.name === name)!;

describe('map labels', () => {
  it('uses 13px where there is room, 11px where it is tight, and nothing where it would spill over', () => {
    expect(labelSize('100%', area('YISHUN').r)).toBe(13);
    expect(labelSize('56%', area('BUKIT PANJANG').r)).toBe(11);
    expect(labelSize('100%', area('BUKIT PANJANG').r)).toBeUndefined();
  });

  it('gives every area a positive label radius', () => {
    for (const a of map.areas) expect(a.r, a.name).toBeGreaterThan(0);
  });
});
