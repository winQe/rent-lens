import { pino } from 'pino';

/** JSON logs to stdout; CloudWatch (or docker logs) collects them as-is. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'rent-lens-api' },
  redact: ['req.headers.authorization', 'req.headers.cookie'],
});
