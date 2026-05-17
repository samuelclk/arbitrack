import { z } from "zod";
import { basisApr, FUNDING_BASIS_SYMBOL_WHITELIST, type Tick, Venue } from "shared";

const FUNDING_RATE_URL = "https://www.okx.com/api/v5/public/funding-rate";
const INSTRUMENTS_URL = "https://www.okx.com/api/v5/public/instruments";
const FUTURES_TICKERS_URL = "https://www.okx.com/api/v5/market/tickers?instType=FUTURES";
const SPOT_TICKERS_URL = "https://www.okx.com/api/v5/market/tickers?instType=SPOT";
const ONE_HOUR_MS = 3_600_000;

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

const instrumentSchema = z.object({
  instId: z.string(),
  uly: z.string(),
  expTime: z.string(),
  ctType: z.string().optional(),
});
const instrumentsResponse = z.object({
  code: z.string(),
  data: z.array(instrumentSchema),
});

const tickerEntry = z.object({
  instId: z.string(),
  last: z.string(),
});
const tickersResponse = z.object({
  code: z.string(),
  data: z.array(tickerEntry),
});

const QUARTERLY_BASES = ["BTC", "ETH"] as const;

let instCache: { fetchedAt: number; instruments: Array<{ instId: string; uly: string; expMs: number; baseAsset: string }> } | null = null;

async function getQuarterlyInstruments() {
  if (!instCache || Date.now() - instCache.fetchedAt > ONE_HOUR_MS) {
    const all: Array<{ instId: string; uly: string; expMs: number; baseAsset: string }> = [];
    for (const base of QUARTERLY_BASES) {
      const uly = `${base}-USDT`;
      const res = await fetch(`${INSTRUMENTS_URL}?instType=FUTURES&uly=${uly}`);
      if (!res.ok) continue;
      const parsed = instrumentsResponse.parse(await res.json());
      for (const i of parsed.data) {
        all.push({ instId: i.instId, uly, expMs: Number(i.expTime), baseAsset: base });
      }
    }
    instCache = { fetchedAt: Date.now(), instruments: all };
  }
  return instCache.instruments;
}

export interface OkxQuarterlyTick extends Tick {
  basisApr: number;
  spotPrice: number;
  expiryMs: number;
}

export async function pollQuarterly(): Promise<OkxQuarterlyTick[]> {
  const [instruments, futResRaw, spotResRaw] = await Promise.all([
    getQuarterlyInstruments(),
    fetch(FUTURES_TICKERS_URL).then((r) => r.json()),
    fetch(SPOT_TICKERS_URL).then((r) => r.json()),
  ]);
  const futTickers = tickersResponse.parse(futResRaw);
  const spotTickers = tickersResponse.parse(spotResRaw);

  const futBy = new Map(futTickers.data.map((t) => [t.instId, Number(t.last)]));
  const spotBy = new Map(spotTickers.data.map((t) => [t.instId, Number(t.last)]));

  const now = Date.now();
  const out: OkxQuarterlyTick[] = [];
  for (const inst of instruments) {
    const fut = futBy.get(inst.instId);
    const spot = spotBy.get(inst.uly);
    if (fut == null || spot == null) continue;
    const days = Math.max(0.5, (inst.expMs - now) / 86_400_000);
    out.push({
      venue: Venue.OKX,
      symbol: inst.instId,
      kind: "futures",
      price: fut,
      expiry: new Date(inst.expMs),
      ts: new Date(now),
      basisApr: basisApr(fut, spot, days),
      spotPrice: spot,
      expiryMs: inst.expMs,
    });
  }
  return out;
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
