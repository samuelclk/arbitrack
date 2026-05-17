import { z } from "zod";
import { type Tick, Venue } from "shared";

const FUNDING_RATES_URL = "https://mainnet.zklighter.elliot.ai/api/v1/funding-rates";

const entry = z.object({
  market_id: z.number(),
  exchange: z.string(),
  symbol: z.string(),
  rate: z.number(),
});

const response = z.object({
  code: z.number(),
  funding_rates: z.array(entry),
});

export interface LighterFundingTick extends Tick {
  marketId: number;
  /** Lighter funding accrues hourly. */
  fundingIntervalHours: 1;
}

export async function pollFunding(): Promise<LighterFundingTick[]> {
  const res = await fetch(FUNDING_RATES_URL);
  if (!res.ok) throw new Error(`lighter funding-rates ${res.status}: ${await res.text()}`);
  const parsed = response.parse(await res.json());

  const ts = new Date();
  const out: LighterFundingTick[] = [];
  for (const e of parsed.funding_rates) {
    if (e.exchange !== "lighter") continue;
    out.push({
      venue: Venue.Lighter,
      symbol: e.symbol,
      kind: "funding",
      price: null,
      fundingRate: e.rate,
      ts,
      marketId: e.market_id,
      fundingIntervalHours: 1,
    });
  }
  return out;
}
