import { randomUUID } from 'node:crypto';
import { rentCheckQuery, streetDetailQuery, streetsQuery, summaryQuery, townsQuery } from '@rent-lens/shared';
import cors from 'cors';
import express, { type ErrorRequestHandler, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { z } from 'zod';
import type { Db, Queryable } from '../db/types.ts';
import { HttpError } from '../handlers/common.ts';
import { getMeta } from '../handlers/meta.ts';
import { checkRent } from '../handlers/rentCheck.ts';
import { getStreetDetail } from '../handlers/streetDetail.ts';
import { getStreets } from '../handlers/streets.ts';
import { getSummary } from '../handlers/summary.ts';
import { getTowns } from '../handlers/towns.ts';

export interface AppOptions {
  db: Db;
  logger: Logger;
  corsOrigins: string[];
  /**
   * Requests per minute per IP on /api; 0 turns the limiter off. The count lives in this process's
   * memory, so it only fits a single server; on AWS, API Gateway throttles instead.
   */
  rateLimitPerMinute?: number;
}

/** The data changes once a month, so responses can be cached by browsers and a CDN. */
const CACHE_CONTROL = 'public, max-age=300';
const REQUEST_ID = /^[A-Za-z0-9-]{1,64}$/;

export function createApp({ db, logger, corsOrigins, rateLimitPerMinute = 120 }: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  // Behind one proxy (the web container's nginx locally, CloudFront/API Gateway on AWS).
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        // Accept an upstream request ID only in a safe shape, so clients cannot forge or bloat log IDs.
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: corsOrigins, methods: ['GET'] }));

  app.get('/healthz', async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ status: 'ok' });
  });

  const api = express.Router();
  if (rateLimitPerMinute > 0) {
    api.use(
      rateLimit({
        windowMs: 60_000,
        limit: rateLimitPerMinute,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        // Same { error } JSON shape as every other error response.
        message: { error: 'Too many requests, please try again in a minute.' },
      }),
    );
  }
  api.get('/meta', get(db, z.object({}), getMeta));
  api.get('/towns', get(db, townsQuery, getTowns));
  api.get('/streets', get(db, streetsQuery, getStreets));
  api.get('/streets/detail', get(db, streetDetailQuery, getStreetDetail));
  api.get('/rent-check', get(db, rentCheckQuery, checkRent));
  api.get('/summary', get(db, summaryQuery, getSummary));
  api.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use('/api/v1', api);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);
  return app;
}

/** Validates req.query with a zod schema, then runs a handler. Express 5 forwards async errors to errorHandler. */
function get<S extends z.ZodType>(db: Db, schema: S, handler: (db: Queryable, query: z.infer<S>) => Promise<unknown>): RequestHandler {
  return async (req, res) => {
    // A repeated parameter (budget=1&budget=2) or the bracket form (budget[]=1) arrives as an array or
    // a "budget[]" key. Say so, instead of zod's "expected number, received NaN".
    const repeated = Object.entries(req.query)
      .filter(([key, value]) => Array.isArray(value) || key.endsWith('[]'))
      .map(([key]) => key.replace(/\[\]$/, ''));
    if (repeated.length > 0) {
      res
        .status(400)
        .json({ error: 'Invalid query parameters', details: Object.fromEntries(repeated.map((key) => [key, ['Give this parameter once']])) });
      return;
    }
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid query parameters', details: z.flattenError(parsed.error).fieldErrors });
      return;
    }
    // Every handler reads the data window and then the statistics. One repeatable-read transaction gives
    // both the same snapshot, so a load that commits mid-request cannot mix old and new data.
    const body = await db.transaction(async (tx) => {
      await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      return handler(tx, parsed.data);
    });
    res.set('Cache-Control', CACHE_CONTROL).json(body);
  };
}

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (isDbUnavailable(err)) {
    req.log.warn({ err }, 'database unavailable');
    res.status(503).json({ error: 'Database unavailable. Try again shortly.' });
    return;
  }
  req.log.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'Internal server error' });
};

/** Connection refused or reset, Postgres shutting down (57P01 etc.), or connection-class errors (08xxx). */
function isDbUnavailable(err: unknown): boolean {
  const { code } = (err ?? {}) as { code?: unknown };
  if (typeof code !== 'string') return false;
  return ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND'].includes(code) || code.startsWith('57P') || code.startsWith('08');
}
