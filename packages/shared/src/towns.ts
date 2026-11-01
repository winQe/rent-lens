/**
 * HDB towns do not match URA planning areas one to one. This maps each HDB town
 * in the rental data to the planning areas we colour on the map.
 */
export const TOWN_PLANNING_AREAS: Record<string, string[]> = {
  'ANG MO KIO': ['ANG MO KIO'],
  BEDOK: ['BEDOK'],
  BISHAN: ['BISHAN'],
  'BUKIT BATOK': ['BUKIT BATOK'],
  'BUKIT MERAH': ['BUKIT MERAH'],
  'BUKIT PANJANG': ['BUKIT PANJANG'],
  'BUKIT TIMAH': ['BUKIT TIMAH'],
  CENTRAL: ['OUTRAM', 'ROCHOR'],
  'CHOA CHU KANG': ['CHOA CHU KANG'],
  CLEMENTI: ['CLEMENTI'],
  GEYLANG: ['GEYLANG'],
  HOUGANG: ['HOUGANG'],
  'JURONG EAST': ['JURONG EAST'],
  'JURONG WEST': ['JURONG WEST'],
  'KALLANG/WHAMPOA': ['KALLANG', 'NOVENA'],
  'MARINE PARADE': ['MARINE PARADE'],
  'PASIR RIS': ['PASIR RIS'],
  PUNGGOL: ['PUNGGOL'],
  QUEENSTOWN: ['QUEENSTOWN'],
  SEMBAWANG: ['SEMBAWANG'],
  SENGKANG: ['SENGKANG'],
  SERANGOON: ['SERANGOON'],
  TAMPINES: ['TAMPINES'],
  TENGAH: ['TENGAH'],
  'TOA PAYOH': ['TOA PAYOH'],
  WOODLANDS: ['WOODLANDS'],
  YISHUN: ['YISHUN'],
};

/** "KALLANG/WHAMPOA" -> "Kallang/Whampoa", "BT PANJANG RING RD" -> "Bt Panjang Ring Rd". */
export function toDisplayName(raw: string): string {
  return raw.toLowerCase().replace(/(^|[\s/-])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}
