import { z } from "zod";

import { Category, Chain, Venue } from "./types.js";

export const venueSchema = z.enum(Venue);
export const chainSchema = z.enum(Chain);
export const categorySchema = z.enum(Category);
export const tickKindSchema = z.enum(["funding", "mark", "spot", "index", "futures"]);

const nullableNumberSchema = z.coerce.number().nullable().optional();
const nullableDateSchema = z.coerce.date().nullable().optional();

export const tickSchema = z.object({
  venue: venueSchema,
  symbol: z.string(),
  kind: tickKindSchema,
  price: nullableNumberSchema,
  fundingRate: nullableNumberSchema,
  expiry: nullableDateSchema,
  ts: z.coerce.date(),
});

export const opportunitySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  category: categorySchema,
  pair: z.string(),
  longVenue: venueSchema.nullable().optional(),
  shortVenue: venueSchema.nullable().optional(),
  chain: chainSchema.nullable().optional(),
  spreadBps: nullableNumberSchema,
  aprBps: z.coerce.number(),
  detail: z.record(z.string(), z.unknown()).default({}),
  computedAt: z.coerce.date(),
});

export const lendRateSchema = z.object({
  chain: chainSchema,
  venue: venueSchema,
  asset: z.string(),
  supplyAprBps: nullableNumberSchema,
  borrowAprBps: nullableNumberSchema,
  ltvBps: nullableNumberSchema,
  lltBps: nullableNumberSchema,
  emode: z.coerce.boolean(),
  borrowable: z.coerce.boolean(),
  totalSupplyUsd: nullableNumberSchema,
  totalBorrowUsd: nullableNumberSchema,
  ts: z.coerce.date(),
});

export const pegSnapSchema = z.object({
  ts: z.coerce.date(),
  unfinalizedSteth: z.coerce.number(),
  lastRequestId: z.coerce.bigint(),
  lastFinalizedId: z.coerce.bigint(),
  estWaitDays: z.coerce.number(),
  bunkerMode: z.coerce.boolean(),
  waitSourceType: z.string().nullable().optional(),
});

export const pendleMarketSchema = z.object({
  chain: chainSchema,
  marketAddr: z.string(),
  underlying: z.literal("wstETH"),
  expiry: z.coerce.date(),
  ptImpliedApyBps: z.coerce.number(),
  ytFloatingApyBps: nullableNumberSchema,
  liquidityUsd: nullableNumberSchema,
  ts: z.coerce.date(),
});

export type TickInput = z.input<typeof tickSchema>;
export type OpportunityInput = z.input<typeof opportunitySchema>;
export type LendRateInput = z.input<typeof lendRateSchema>;
export type PegSnapInput = z.input<typeof pegSnapSchema>;
export type PendleMarketInput = z.input<typeof pendleMarketSchema>;
