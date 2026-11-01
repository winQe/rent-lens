export const FLAT_TYPES = ['1-ROOM', '2-ROOM', '3-ROOM', '4-ROOM', '5-ROOM', 'EXECUTIVE'] as const;
export type FlatType = (typeof FLAT_TYPES)[number];

export const FLAT_TYPE_LABELS: Record<FlatType, string> = {
  '1-ROOM': '1-room',
  '2-ROOM': '2-room',
  '3-ROOM': '3-room',
  '4-ROOM': '4-room',
  '5-ROOM': '5-room',
  EXECUTIVE: 'Executive',
};

/**
 * HDB datasets spell flat types differently: the rental data uses "4-ROOM",
 * the resale data uses "4 ROOM". Normalise to the hyphenated form.
 */
export function normalizeFlatType(raw: string): FlatType | null {
  const value = raw.trim().toUpperCase().replace(/\s+/g, '-');
  return (FLAT_TYPES as readonly string[]).includes(value) ? (value as FlatType) : null;
}
