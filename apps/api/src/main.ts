import { corsOrigins, requireEnv } from './config.ts';
import { createPgDb } from './db/pg.ts';
import { createApp } from './http/app.ts';
import { logger } from './logger.ts';

const db = createPgDb(requireEnv('DATABASE_URL'), { statementTimeoutMs: 10_000, queryTimeoutMs: 15_000 });
const app = createApp({ db, logger, corsOrigins: corsOrigins() });
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
