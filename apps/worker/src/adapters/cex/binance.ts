import { z } from "zod";
import { FUNDING_BASIS_SYMBOL_WHITELIST, type Tick, Venue } from "shared";

const PREMIUM_INDEX_URL = "https://fapi.binance.com/fapi/v1/premiumIndex";
const FUNDING_INFO_URL = "https://fapi.binance.com/fapi/v1/fundingInfo";
const ONE_HOUR_MS = 3_600_000;

const WHITELIST_SYMBOLS = new Set(
  FUNDING_BASIS_SYMBOL_WHITELIST.map((s) => `${s}USDT`),
);

const premiumIndexEntry = z.object({
  symbol: z.string(),
  markPrice: z.string(),
  lastFundingRate: z.string(),
  nextFundingTime: z.number().nullable().optional(),
  time: z.number(),
});
const premiumIndexResponse = z.array(premiumIndexEntry);

const fundingInfoEntry = z.object({
  symbol: z.string(),
  fundingIntervalHours: z.number(),
});
const fundingInfoResponse = z.array(fundingInfoEntry);

let fundingInfoCache: { fetchedAt: number; bySymbol: Map<string, number> } | null = null;

async function getFundingIntervalHours(symbol: string): Promise<number> {
  if (!fundingInfoCache || Date.now() - fundingInfoCache.fetchedAt > ONE_HOUR_MS) {
    const res = await fetch(FUNDING_INFO_URL);
    if (!res.ok) throw new Error(`fundingInfo ${res.status}: ${await res.text()}`);
    const parsed = fundingInfoResponse.parse(await res.json());
    fundingInfoCache = {
      fetchedAt: Date.now(),
      bySymbol: new Map(parsed.map((e) => [e.symbol, e.fundingIntervalHours])),
    };
  }
  return fundingInfoCache.bySymbol.get(symbol) ?? 8;
}

export interface BinanceFundingTick extends Tick {
  fundingIntervalHours: number;
}

export async function pollFunding(): Promise<BinanceFundingTick[]> {
  const res = await fetch(PREMIUM_INDEX_URL);
  if (!res.ok) throw new Error(`premiumIndex ${res.status}: ${await res.text()}`);
  const entries = premiumIndexResponse.parse(await res.json());

  const out: BinanceFundingTick[] = [];
  for (const e of entries) {
    if (!WHITELIST_SYMBOLS.has(e.symbol)) continue;
    const intervalHours = await getFundingIntervalHours(e.symbol);
    out.push({
      venue: Venue.Binance,
      symbol: e.symbol,
      kind: "funding",
      price: Number(e.markPrice),
      fundingRate: Number(e.lastFundingRate),
      ts: new Date(e.time),
      fundingIntervalHours: intervalHours,
    });
  }
  return out;
}
