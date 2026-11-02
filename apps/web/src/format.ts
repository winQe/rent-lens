import type { TownBudgetRow } from '@rent-lens/shared';

const whole = new Intl.NumberFormat('en-SG', { maximumFractionDigits: 0 });

/** S$3,000 */
export const money = (value: number) => `S$${whole.format(value)}`;

/** 0.08 -> "+8%", -0.05 -> "-5%": a change, always signed so the direction is never left to colour. */
export function signedPercent(change: number): string {
  const shown = Math.round(change * 100);
  return shown > 0 ? `+${shown}%` : `${shown}%`;
}

/** 0.7407 -> "74%" */
export const percent = (share: number) => `${Math.round(share * 100)}%`;

/**
 * 0.7407 -> 7 (as in "7 in 10 rentals"). Rounds down, so a street the headline does not count
 * as fitting (share under 0.5) never shows "5 in 10". The small epsilon keeps 0.7 * 10 = 6.999... at 7.
 */
export const inTen = (share: number) => Math.floor(share * 10 + 1e-9);

/** "7 in 10", or "Under 1 in 10" when some rents fit but fewer than one in ten. */
export function inTenLabel(share: number): string {
  const n = inTen(share);
  return n === 0 && share > 0 ? 'Under 1 in 10' : `${n} in 10`;
}

/**
 * The five towns with the highest share, leaving out towns with too few rentals. Ties go to the town
 * with more rentals, whose share is more reliable. Shared by the map and the list.
 */
export const topTowns = (towns: TownBudgetRow[]) =>
  [...towns]
    .filter((t) => !t.lowData)
    .sort((a, b) => b.share - a.share || b.rentals - a.rentals)
    .slice(0, 5);

/** "2025-10" -> "Oct 2025" */
export function monthLabel(yyyyMm: string): string {
  const [year, month] = yyyyMm.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, 1)).toLocaleString('en-SG', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/**
 * Map colour step for a town's share of rents within budget (0 = least, 4 = most).
 * The steps reach 75% so a budget above most rents (2-room at S$2,500) still shows differences.
 * Uses the same rounded percent the labels show, so a town labelled "50%" is never coloured "25 to 49%".
 */
export function shareStep(share: number): 0 | 1 | 2 | 3 | 4 {
  const shown = Math.round(share * 100);
  if (shown >= 75) return 4;
  if (shown >= 50) return 3;
  if (shown >= 25) return 2;
  if (shown >= 10) return 1;
  return 0;
}
