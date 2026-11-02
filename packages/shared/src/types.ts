import type { FlatType } from './flatTypes.ts';

/** The window every statistic is computed over, as YYYY-MM months (inclusive). */
export interface DataWindow {
  fromMonth: string;
  toMonth: string;
}

export interface MetaResponse {
  window: DataWindow;
  rowCount: number;
  loadedAt: string;
  source: string;
}

export interface TownBudgetRow {
  town: string;
  rentals: number;
  withinBudget: number;
  /** withinBudget / rentals, 0 to 1. */
  share: number;
  lowData: boolean;
}

export interface TownsResponse {
  flatType: FlatType;
  budget: number;
  window: DataWindow;
  towns: TownBudgetRow[];
}

export interface StreetBudgetRow {
  town: string;
  street: string;
  rentals: number;
  withinBudget: number;
  share: number;
  p25: number;
  median: number;
  p75: number;
  lowData: boolean;
}

export interface StreetsResponse {
  flatType: FlatType;
  budget: number;
  window: DataWindow;
  /** Streets with at least FIT_SHARE of rents within budget (respects includeLowData and town). */
  fitCount: number;
  /** Streets with fewer than MIN_RENTALS rentals (in `items` only when includeLowData is set). */
  lowDataCount: number;
  total: number;
  page: number;
  pageSize: number;
  items: StreetBudgetRow[];
}

export interface HistogramBin {
  from: number;
  /** Exclusive upper bound. */
  to: number;
  count: number;
}

export interface QuarterPoint {
  quarter: string;
  streetMedian: number | null;
  streetRentals: number;
  nationalMedian: number | null;
}

export interface StreetDetailResponse {
  flatType: FlatType;
  town: string;
  street: string;
  window: DataWindow;
  rentals: number;
  blocks: number;
  p25: number;
  median: number;
  p75: number;
  townMedian: number;
  lowData: boolean;
  histogram: HistogramBin[];
  trend: QuarterPoint[];
}

/** A median rent in the latest 12 months against the 12 months before. */
export interface YearOnYear {
  rentals: number;
  median: number;
  previousMedian: number;
  /** median / previousMedian - 1, for example 0.08 for 8% higher. */
  change: number;
}

export interface SummaryResponse {
  flatType: FlatType;
  window: DataWindow;
  previousWindow: DataWindow;
  /** Every flat type with at least MIN_RENTALS rentals in both periods. */
  flatTypes: Array<YearOnYear & { flatType: FlatType }>;
  /** Towns for the requested flat type whose median changed most, rising or falling (at most 5). */
  towns: Array<YearOnYear & { town: string }>;
}

export type RentVerdict = 'below' | 'usual' | 'above';

export interface RentCheckResponse {
  flatType: FlatType;
  rent: number;
  /** Which group the rent was compared with. Falls back to the town when the street has too few rentals. */
  comparedWith: 'street' | 'town';
  town: string;
  street: string;
  rentals: number;
  lower: number;
  equal: number;
  /** Share of rentals strictly lower than the rent, 0 to 1. */
  shareLower: number;
  p25: number;
  p75: number;
  verdict: RentVerdict;
  /** True when even the town has fewer than MIN_RENTALS rentals, so the verdict is weak. */
  lowData: boolean;
}

export interface ApiError {
  error: string;
  details?: unknown;
}
