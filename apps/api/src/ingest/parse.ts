import { type FlatType, normalizeFlatType } from '@rent-lens/shared';
import { parse } from 'csv-parse/sync';

export interface RentalRow {
  /** First day of the approval month, YYYY-MM-01. */
  approvalMonth: string;
  town: string;
  block: string;
  streetName: string;
  flatType: FlatType;
  monthlyRent: number;
}

export interface ParseResult {
  rows: RentalRow[];
  rejected: number;
  /** A few examples of rejected lines, for the ingest log. */
  rejectedSamples: Array<{ line: number; reason: string }>;
}

const EXPECTED_COLUMNS = ['rent_approval_date', 'town', 'block', 'street_name', 'flat_type', 'monthly_rent'];
const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;
/** Whole dollars, optionally written with zero cents ("2500" or "2500.00"). */
const WHOLE_DOLLARS = /^\d+(\.0+)?$/;
/** The dataset starts in Jan 2021. */
const EARLIEST_MONTH = '2021-01';
/**
 * Highest plausible monthly rent for an HDB flat. Rents in the data top out near S$10,000;
 * a typo like 300000 would otherwise stretch every chart for that street.
 */
const MAX_RENT = 50_000;

export class SchemaError extends Error {}

/**
 * Parses the data.gov.sg CSV. Rows that fail validation are counted and skipped
 * instead of failing the whole load; the caller decides how many rejects are too many.
 */
export function parseRentalCsv(csv: string): ParseResult {
  // Parse rows as arrays and check the field count per row: with `columns: true` csv-parse
  // throws on the first row with a stray comma, which would abort the whole monthly load.
  const [header = [], ...lines] = parse(csv, { skip_empty_lines: true, trim: true, bom: true, relax_column_count: true }) as string[][];
  const missing = EXPECTED_COLUMNS.filter((c) => !header.includes(c));
  if (lines.length > 0 && missing.length > 0) {
    throw new SchemaError(`CSV is missing columns: ${missing.join(', ')}`);
  }

  const rows: RentalRow[] = [];
  const rejectedSamples: ParseResult['rejectedSamples'] = [];
  let rejected = 0;

  lines.forEach((fields, i) => {
    const reason =
      fields.length === header.length
        ? validate(Object.fromEntries(header.map((name, j) => [name, fields[j] ?? ''])))
        : `expected ${header.length} fields, got ${fields.length}`;
    if (typeof reason === 'string') {
      rejected++;
      if (rejectedSamples.length < 5) rejectedSamples.push({ line: i + 2, reason });
      return;
    }
    rows.push(reason);
  });

  return { rows, rejected, rejectedSamples };
}

function validate(r: Record<string, string>): RentalRow | string {
  const month = r.rent_approval_date ?? '';
  if (!MONTH.test(month)) return `bad rent_approval_date "${month}"`;
  // A single future-dated typo would become the newest month and move every statistic's window.
  if (month < EARLIEST_MONTH || month > currentMonth()) return `rent_approval_date out of range "${month}"`;
  const flatType = normalizeFlatType(r.flat_type ?? '');
  if (!flatType) return `unknown flat_type "${r.flat_type}"`;
  const rawRent = r.monthly_rent ?? '';
  const rent = Number(rawRent);
  if (!WHOLE_DOLLARS.test(rawRent) || rent <= 0 || rent > MAX_RENT) return `bad monthly_rent "${rawRent}"`;
  const town = (r.town ?? '').toUpperCase();
  const streetName = (r.street_name ?? '').toUpperCase();
  const block = (r.block ?? '').toUpperCase();
  if (!town || !streetName || !block) return 'missing town, street_name or block';
  return { approvalMonth: `${month}-01`, town, block, streetName, flatType, monthlyRent: rent };
}

/** YYYY-MM in Singapore time, the timezone of the source data. */
const SG_MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit' });
const currentMonth = () => SG_MONTH.format(new Date());
