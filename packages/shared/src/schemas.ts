import { z } from 'zod';
import { BUDGET_MAX, BUDGET_MIN } from './constants.ts';
import { FLAT_TYPES } from './flatTypes.ts';

const flatType = z.enum(FLAT_TYPES);
const budget = z.coerce.number().int().min(BUDGET_MIN).max(BUDGET_MAX);
// Control characters (a NUL byte in particular) are rejected here: Postgres refuses them, which was a 500.
const name = z
  .string()
  .trim()
  .min(1)
  .max(80)
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to reject control characters.
  .regex(/^[^\u0000-\u001f]*$/, 'Must not contain control characters')
  .transform((s) => s.toUpperCase());

export const townsQuery = z.object({
  flatType,
  budget,
});

export const streetsQuery = z.object({
  flatType,
  budget,
  town: name.optional(),
  includeLowData: z.stringbool().default(false),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

export const streetDetailQuery = z.object({
  flatType,
  town: name,
  street: name,
});

export const rentCheckQuery = z.object({
  flatType,
  town: name,
  street: name,
  rent: budget,
});

export const summaryQuery = z.object({
  flatType,
});

export type TownsQuery = z.infer<typeof townsQuery>;
export type StreetsQuery = z.infer<typeof streetsQuery>;
export type StreetDetailQuery = z.infer<typeof streetDetailQuery>;
export type RentCheckQuery = z.infer<typeof rentCheckQuery>;
export type SummaryQuery = z.infer<typeof summaryQuery>;
