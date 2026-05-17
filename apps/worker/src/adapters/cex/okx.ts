import { z } from "zod";
import { FUNDING_BASIS_SYMBOL_WHITELIST, type Tick, Venue } from "shared";

const FUNDING_RATE_URL = "https://www.okx.com/api/v5/public/funding-rate";

// Rate limit: 20 req / 2s per IP. Batch ≤10 in flight, wait 1100ms between batches.
const BATCH_SIZE = 10;
const BATCH_INTERVAL_MS = 1_100;

const entry = z.object({
  instId: z.string(),
  fundingRate: z.string(),
  fundingTime: z.string(),
  nextFundingTime: z.string(),
  ts: z.string(),
});

const response = z.object({
  code: z.string(),
  msg: z.string().optional(),
  data: z.array(entry),
});

export interface OkxFundingTick extends Tick {
  fundingIntervalHours: number;
}

async function fetchOne(instId: string): Promise<OkxFundingTick | null> {
  const res = await fetch(`${FUNDING_RATE_URL}?instId=${instId}`);
  if (!res.ok) return null;
  const parsed = response.parse(await res.json());
  if (parsed.code !== "0" || parsed.data.length === 0) return null;
  const e = parsed.data[0];
  const fundingTime = Number(e.fundingTime);
  const nextFundingTime = Number(e.nextFundingTime);
  const intervalHours = Math.max(1, Math.round((nextFundingTime - fundingTime) / 3_600_000));
  return {
    venue: Venue.OKX,
    symbol: e.instId,
    kind: "funding",
    price: null,
    fundingRate: Number(e.fundingRate),
    ts: new Date(Number(e.ts)),
    fundingIntervalHours: intervalHours,
  };
}

export async function pollFunding(): Promise<OkxFundingTick[]> {
  const instIds = FUNDING_BASIS_SYMBOL_WHITELIST.map((s) => `${s}-USDT-SWAP`);
  const out: OkxFundingTick[] = [];

  for (let i = 0; i < instIds.length; i += BATCH_SIZE) {
    const batch = instIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(fetchOne));
    for (const r of results) if (r) out.push(r);
    if (i + BATCH_SIZE < instIds.length) {
      await new Promise((res) => setTimeout(res, BATCH_INTERVAL_MS));
    }
  }
  return out;
}
