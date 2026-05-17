import { z } from "zod";
import { FUNDING_BASIS_SYMBOL_WHITELIST, type Tick, Venue } from "shared";

const TICKERS_URL = "https://api.bybit.com/v5/market/tickers?category=linear";

const WHITELIST_SYMBOLS = new Set(
  FUNDING_BASIS_SYMBOL_WHITELIST.map((s) => `${s}USDT`),
);

const tickerEntry = z.object({
  symbol: z.string(),
  markPrice: z.string(),
  fundingRate: z.string(),
  nextFundingTime: z.string(),
  fundingIntervalHour: z.string(),
});

const tickersResponse = z.object({
  retCode: z.number(),
  retMsg: z.string(),
  result: z.object({
    list: z.array(tickerEntry),
  }),
  time: z.number(),
});

export interface BybitFundingTick extends Tick {
  fundingIntervalHours: number;
}

export async function pollFunding(): Promise<BybitFundingTick[]> {
  const res = await fetch(TICKERS_URL);
  if (!res.ok) throw new Error(`bybit tickers ${res.status}: ${await res.text()}`);
  const parsed = tickersResponse.parse(await res.json());
  if (parsed.retCode !== 0) throw new Error(`bybit retCode ${parsed.retCode}: ${parsed.retMsg}`);

  const ts = new Date(parsed.time);
  const out: BybitFundingTick[] = [];
  for (const e of parsed.result.list) {
    if (!WHITELIST_SYMBOLS.has(e.symbol)) continue;
    out.push({
      venue: Venue.Bybit,
      symbol: e.symbol,
      kind: "funding",
      price: Number(e.markPrice),
      fundingRate: Number(e.fundingRate),
      ts,
      fundingIntervalHours: Number(e.fundingIntervalHour),
    });
  }
  return out;
}
