import pg from 'pg';
import { logger } from '../logger.ts';
import type { Db, Queryable } from './types.ts';

export interface PgOptions {
  maxConnections?: number;
  /** Server-side limit per statement. Set for the API only: ingest and migrations run long statements. */
  statementTimeoutMs?: number;
  /**
   * Client-side limit per query. statement_timeout cannot fire when the network path dies without
   * a reset (failover, NAT drop), so the client has to give up on its own.
   */
  queryTimeoutMs?: number;
}

/** A connection string (local, Docker), or explicit settings with TLS (AWS, see connection.ts). */
export type Connection = string | pg.ClientConfig;

export function createPgDb(connection: Connection, { maxConnections = 5, statementTimeoutMs, queryTimeoutMs }: PgOptions = {}): Db {
  // jit=off: the percentile aggregates push the planner's cost estimate over jit_above_cost,
  // so Postgres spends ~100 ms compiling a query that runs in ~7 ms. Measured on the full
  // dataset; see "Query performance" in docs/DESIGN.md. On RDS this also goes in the parameter group.
  const settings = ['-c jit=off', ...(statementTimeoutMs ? [`-c statement_timeout=${statementTimeoutMs}`] : [])];
  const pool = new pg.Pool({
    ...(typeof connection === 'string' ? { connectionString: connection } : connection),
    max: maxConnections,
    // Fail fast instead of queueing requests forever when the database is unreachable.
    connectionTimeoutMillis: 5_000,
    query_timeout: queryTimeoutMs,
    keepAlive: true,
    options: settings.join(' '),
  });
  // An idle client losing its connection (database restart, failover) emits 'error' on the pool.
  // Unhandled, that crashes the process; the pool drops the client and reconnects on next use.
  pool.on('error', (err) => logger.warn({ err }, 'idle database connection lost'));

  const wrap = (client: pg.Pool | pg.PoolClient): Queryable => ({
    async query<T>(text: string, params?: unknown[]) {
      const result = await client.query(text, params);
      return { rows: result.rows as T[] };
    },
    async exec(sql: string) {
      // Without parameters node-postgres uses the simple protocol, which allows several statements.
      await client.query(sql);
    },
  });

  return {
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await fn(wrap(client));
        await client.query('commit');
        client.release();
        return result;
      } catch (err) {
        // A failed rollback means the connection is broken: keep the original error and
        // destroy the client instead of returning it to the pool.
        const rollbackFailed = await client.query('rollback').then(
          () => false,
          () => true,
        );
        client.release(rollbackFailed ? (err as Error) : undefined);
        throw err;
      }
    },
    close: () => pool.end(),
  };
}
