/** Statistics use the latest N months of approvals in the dataset, not the current date. */
export const WINDOW_MONTHS = 12;

/**
 * Groups with fewer rentals than this are flagged as low data and hidden from the
 * default street ranking. Most blocks have 1 to 2 rentals a year, so we never
 * report block-level statistics. HDB itself hides town medians below 20 per quarter.
 */
export const MIN_RENTALS = 10;

/** A street "fits" a budget when at least this share of its rents are at or below it. */
export const FIT_SHARE = 0.5;

/** "Renting Out of Flats from Jan 2021", Housing & Development Board, data.gov.sg. */
export const DATASET_ID = 'd_c9f57187485a850908655db0e8cfe651';

export const BUDGET_MIN = 300;
export const BUDGET_MAX = 10_000;
