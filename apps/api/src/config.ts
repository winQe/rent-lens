import { resolve } from 'node:path';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

/** A whole-number setting from the environment, or the default when it is not set. */
export function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a whole number of 0 or more, got "${raw}"`);
  return value;
}

/** Bundled copy of the dataset, used when data.gov.sg cannot be reached. */
export function snapshotPath(): string {
  return process.env.SNAPSHOT_PATH ?? resolve(process.cwd(), '../../data/rentals-snapshot.csv.gz');
}

export function corsOrigins(): string[] {
  return (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
