export interface Queryable {
  /** One parameterised statement. */
  query<T>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** A script of one or more statements without parameters (migrations). */
  exec(sql: string): Promise<void>;
}

/**
 * The handlers only depend on this interface. Production uses node-postgres;
 * tests use PGlite (real Postgres compiled to WebAssembly) so they need no server.
 */
export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
