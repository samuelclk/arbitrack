import { z } from "zod";
import { FUNDING_BASIS_SYMBOL_WHITELIST, type Tick, Venue } from "shared";

const PREMIUM_INDEX_URL = "https://fapi.asterdex.com/fapi/v3/premiumIndex";

const WHITELIST_SYMBOLS = new Set(
  FUNDING_BASIS_SYMBOL_WHITELIST.map((s) => `${s}USDT`),
);

const entry = z.object({
  symbol: z.string(),
  markPrice: z.string(),
  lastFundingRate: z.string(),
  time: z.number(),
});
const response = z.array(entry);

export interface AsterFundingTick extends Tick {
  fundingIntervalHours: 8;
}

export async function pollFunding(): Promise<AsterFundingTick[]> {
  const res = await fetch(PREMIUM_INDEX_URL);
  if (!res.ok) throw new Error(`aster premiumIndex ${res.status}: ${await res.text()}`);
  const entries = response.parse(await res.json());

  const out: AsterFundingTick[] = [];
  for (const e of entries) {
    if (!WHITELIST_SYMBOLS.has(e.symbol)) continue;
    out.push({
      venue: Venue.Aster,
      symbol: e.symbol,
      kind: "funding",
      price: Number(e.markPrice),
      fundingRate: Number(e.lastFundingRate),
      ts: new Date(e.time),
      fundingIntervalHours: 8,
    });
  }
  return out;
}
