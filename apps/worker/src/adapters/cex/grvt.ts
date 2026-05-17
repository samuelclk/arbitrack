import { z } from "zod";
import { type Tick, Venue } from "shared";

const INSTRUMENTS_URL = "https://market-data.grvt.io/full/v1/instruments";
const TICKER_URL = "https://market-data.grvt.io/full/v1/ticker";
const TOP_N = 20;

const instrumentSchema = z.object({
  instrument: z.string(),
  base: z.string(),
  quote: z.string(),
  funding_interval_hours: z.number(),
});

const instrumentsResponse = z.object({
  result: z.array(instrumentSchema),
});

const tickerSchema = z.object({
  instrument: z.string(),
  event_time: z.string(), // nanoseconds
  mark_price: z.string(),
  funding_rate: z.string(),
  funding_rate_8h_curr: z.string().optional(),
});

const tickerResponse = z.object({ result: tickerSchema });

export interface GrvtFundingTick extends Tick {
  fundingIntervalHours: number;
}

/**
 * GRVT's `funding_rate` is the **per-interval rate expressed as a percent**
 * (e.g. "0.0087" = 0.0087% per 8h ≈ 9.5% APR). Cross-checked against other
 * venues' BTC funding magnitudes. We divide by 100 to store the decimal
 * per-interval rate, matching the Tick.fundingRate contract.
 */
function grvtRateToDecimal(percentString: string): number {
  return Number(percentString) / 100;
}

async function fetchTicker(instrument: string, intervalHours: number): Promise<GrvtFundingTick | null> {
  const res = await fetch(TICKER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ instrument }),
  });
  if (!res.ok) return null;
  const parsed = tickerResponse.parse(await res.json());
  const t = parsed.result;
  // event_time is nanoseconds — divide by 1e6 for ms
  const tsMs = Number(BigInt(t.event_time) / 1_000_000n);
  return {
    venue: Venue.GRVT,
    symbol: t.instrument,
    kind: "funding",
    price: Number(t.mark_price),
    fundingRate: grvtRateToDecimal(t.funding_rate),
    ts: new Date(tsMs),
    fundingIntervalHours: intervalHours,
  };
}

export async function pollFunding(): Promise<GrvtFundingTick[]> {
  const instRes = await fetch(INSTRUMENTS_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!instRes.ok) throw new Error(`grvt instruments ${instRes.status}`);
  const instruments = instrumentsResponse.parse(await instRes.json()).result;

  // BTC_USDT_Perp + top-N (deduped)
  const targets = new Map<string, number>();
  const btc = instruments.find((i) => i.instrument === "BTC_USDT_Perp");
  if (btc) targets.set(btc.instrument, btc.funding_interval_hours);
  for (const i of instruments.slice(0, TOP_N)) {
    if (!targets.has(i.instrument)) targets.set(i.instrument, i.funding_interval_hours);
  }

  const out: GrvtFundingTick[] = [];
  for (const [instrument, intervalHours] of targets) {
    const tick = await fetchTicker(instrument, intervalHours);
    if (tick) out.push(tick);
  }
  return out;
}
