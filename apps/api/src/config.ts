import { resolve } from 'node:path';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
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
