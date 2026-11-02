import { corsOrigins, intEnv } from './config.ts';
import { databaseConnection } from './db/connection.ts';
import { createPgDb } from './db/pg.ts';
import { createApp } from './http/app.ts';
import { logger } from './logger.ts';

// A Lambda instance serves one request at a time, so it sets DB_POOL_MAX=1; a long-running server keeps 5.
const db = createPgDb(await databaseConnection(), { maxConnections: intEnv('DB_POOL_MAX', 5), statementTimeoutMs: 10_000, queryTimeoutMs: 15_000 });
// RATE_LIMIT_PER_MINUTE=0 turns the in-memory limiter off, for AWS, where API Gateway throttles instead.
const app = createApp({ db, logger, corsOrigins: corsOrigins(), rateLimitPerMinute: intEnv('RATE_LIMIT_PER_MINUTE', 120) });
const port = Number(process.env.PORT ?? 3000);

const server = app.listen(port, () => logger.info({ port }, 'api listening'));

let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (shuttingDown) return; // a second signal must not close the server and pool twice
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    // Give in-flight requests 10 s, then exit anyway rather than hang.
    setTimeout(() => process.exit(1), 10_000).unref();
    server.close(() => {
      db.close().then(
        () => process.exit(0),
        (err: unknown) => {
          logger.error({ err }, 'error closing the database pool');
          process.exit(1);
        },
      );
    });
  });
}
