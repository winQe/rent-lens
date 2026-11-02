import type { Logger } from 'pino';
import type { Db } from '../db/types.ts';
import { type LoadSummary, replaceRentals } from './load.ts';
import { parseRentalCsv, type RentalRow } from './parse.ts';
import { downloadDataset, readCsvFile } from './source.ts';

export interface IngestOptions {
  /** Load this CSV (or .csv.gz) instead of downloading. */
  file?: string;
  /**
   * Used only when the database is still empty and the download fails or is unusable, so a
   * first start works offline. It never replaces loaded data: the snapshot is older.
   */
  fallbackFile?: string;
  /** Abort if more than this share of rows fail validation: it usually means the source format changed. */
  maxRejectShare?: number;
  /** Skip the staleness and row-drop guards, for a deliberate reload. */
  force?: boolean;
  download?: () => Promise<string>;
}

interface Checked {
  rows: RentalRow[];
  rejected: number;
  source: string;
}

export async function ingest(db: Db, log: Logger, opts: IngestOptions = {}): Promise<LoadSummary & { source: string }> {
  let checked: Checked;
  if (opts.file) {
    checked = check(log, opts, await readCsvFile(opts.file), 'local file');
  } else {
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM dataset_meta');
    const empty = !rows[0]?.n;
    // The fallback covers only getting a usable file. Database errors during the load below
    // are never a reason to swap in the older snapshot.
    try {
      checked = check(log, opts, await (opts.download ?? downloadDataset)(), 'data.gov.sg');
    } catch (err) {
      if (!opts.fallbackFile || !empty) throw err;
      log.warn({ err }, 'download failed or unusable and the database is empty, loading bundled snapshot');
      checked = check(log, opts, await readCsvFile(opts.fallbackFile), 'bundled snapshot');
    }
  }

  // `source` is shown publicly by /api/meta, so it is a label, never a server file path.
  const summary = await replaceRentals(db, checked.rows, checked.rejected, checked.source, { force: opts.force });
  log.info({ ...summary, source: checked.source }, 'loaded rental approvals');

  // VACUUM sets the visibility map, so the covering indexes give true index-only scans
  // (0 heap fetches instead of one per row); ANALYZE refreshes planner statistics. The data is
  // already committed, so a failure here only costs speed until autovacuum runs: warn, not fail.
  try {
    await db.exec('VACUUM ANALYZE rental_approval');
  } catch (err) {
    log.warn({ err }, 'vacuum after load failed; queries stay correct but may be slower until autovacuum');
  }
  return { ...summary, source: checked.source };
}

/** Parses and applies the reject limit; throws if the file is not usable. */
function check(log: Logger, opts: IngestOptions, csv: string, source: string): Checked {
  const parsed = parseRentalCsv(csv);
  const total = parsed.rows.length + parsed.rejected;
  log.info({ source, total, rejected: parsed.rejected, samples: parsed.rejectedSamples }, 'parsed rental CSV');

  const maxRejectShare = opts.maxRejectShare ?? 0.01;
  if (total === 0 || parsed.rejected / total > maxRejectShare) {
    throw new Error(`Rejected ${parsed.rejected} of ${total} rows (limit ${maxRejectShare * 100}%), not loading`);
  }
  return { rows: parsed.rows, rejected: parsed.rejected, source };
}
