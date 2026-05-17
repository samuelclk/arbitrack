import { z } from "zod";
import { basisApr, type Tick, Venue } from "shared";

const INSTRUMENTS_URL = "https://www.deribit.com/api/v2/public/get_instruments";
const TICKER_URL = "https://www.deribit.com/api/v2/public/ticker";

const SUPPORTED_CURRENCIES = ["BTC", "ETH"] as const;
type Currency = (typeof SUPPORTED_CURRENCIES)[number];

const instrument = z.object({
  instrument_name: z.string(),
  settlement_period: z.string(),
  expiration_timestamp: z.number(),
  base_currency: z.string(),
});

const instrumentsResponse = z.object({
  result: z.array(instrument),
});

const tickerResult = z.object({
  instrument_name: z.string(),
  last_price: z.number().nullable().optional(),
  mark_price: z.number().nullable().optional(),
  index_price: z.number().nullable().optional(),
  timestamp: z.number(),
});

const tickerResponse = z.object({ result: tickerResult });

export interface DeribitQuarterlyTick extends Tick {
  basisApr: number;
  indexPrice: number;
  expiryMs: number;
  settlementPeriod: string;
}

async function fetchInstruments(currency: Currency) {
  const url = `${INSTRUMENTS_URL}?currency=${currency}&kind=future&expired=false`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`deribit instruments ${res.status}`);
  return instrumentsResponse.parse(await res.json()).result;
}

async function fetchTicker(instrument: string) {
  const res = await fetch(`${TICKER_URL}?instrument_name=${instrument}`);
  if (!res.ok) return null;
  return tickerResponse.parse(await res.json()).result;
}

export async function pollQuarterly(): Promise<DeribitQuarterlyTick[]> {
  const all = (
    await Promise.all(SUPPORTED_CURRENCIES.map((c) => fetchInstruments(c)))
  ).flat();
  // Filter to month+ quarterlies (drop day/week/perpetual)
  const quarterlies = all.filter((i) => i.settlement_period === "month" || i.settlement_period === "quarter");

  const out: DeribitQuarterlyTick[] = [];
  for (const inst of quarterlies) {
    const ticker = await fetchTicker(inst.instrument_name);
    if (!ticker) continue;
    const futPrice = ticker.mark_price ?? ticker.last_price;
    const indexPrice = ticker.index_price;
    if (futPrice == null || indexPrice == null) continue;
    const days = Math.max(0.5, (inst.expiration_timestamp - ticker.timestamp) / 86_400_000);
    out.push({
      venue: Venue.Deribit,
      symbol: inst.instrument_name,
      kind: "futures",
      price: futPrice,
      expiry: new Date(inst.expiration_timestamp),
      ts: new Date(ticker.timestamp),
      basisApr: basisApr(futPrice, indexPrice, days),
      indexPrice,
      expiryMs: inst.expiration_timestamp,
      settlementPeriod: inst.settlement_period,
    });
  }
  return out;
}
