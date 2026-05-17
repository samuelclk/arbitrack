import { fundingApr, crossVenueFundingSpread, Venue, type Tick } from "shared";
import { pgPool } from "../db/client.js";
import { pollFunding as pollBinance } from "../adapters/cex/binance.js";
import { pollFunding as pollBybit } from "../adapters/cex/bybit.js";
import { pollFunding as pollOkx } from "../adapters/cex/okx.js";
import { pollFunding as pollHyperliquid } from "../adapters/cex/hyperliquid.js";
import { pollFunding as pollLighter } from "../adapters/cex/lighter.js";
import { pollFunding as pollAster } from "../adapters/cex/aster.js";
import { pollFunding as pollGrvt } from "../adapters/cex/grvt.js";

interface FundingTick extends Tick {
  fundingIntervalHours: number;
}

function normalizeBase(venue: Venue, sym: string): string | null {
  switch (venue) {
    case Venue.OKX:
      return sym.split("-")[0] || null;
    case Venue.GRVT:
      return sym.split("_")[0] || null;
    case Venue.Hyperliquid:
    case Venue.Lighter:
      return sym;
    case Venue.Binance:
    case Venue.Bybit:
    case Venue.Aster:
      return sym.endsWith("USDT") ? sym.slice(0, -4) : null;
    default:
      return null;
  }
}

async function pollAllVenues(): Promise<FundingTick[]> {
  const sources: Array<Promise<FundingTick[]>> = [
    pollBinance(),
    pollBybit(),
    pollOkx(),
    pollHyperliquid(),
    pollLighter(),
    pollAster(),
    pollGrvt(),
  ];
  const results = await Promise.allSettled(sources);
  const all: FundingTick[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
    else console.warn("funding poll failed:", r.reason);
  }
  return all;
}

async function insertTicks(ticks: FundingTick[]): Promise<void> {
  if (ticks.length === 0) return;
  const values: unknown[] = [];
  const rows: string[] = [];
  let i = 1;
  for (const t of ticks) {
    rows.push(`($${i++}, $${i++}, 'funding', $${i++}, $${i++}, $${i++})`);
    values.push(t.venue, t.symbol, t.price ?? null, t.fundingRate ?? null, t.ts);
  }
  await pgPool.query(
    `INSERT INTO ticks (venue, symbol, kind, price, funding_rate, ts)
     VALUES ${rows.join(",")}
     ON CONFLICT (venue, symbol, kind, ts) DO NOTHING`,
    values,
  );
}

async function upsertOpportunities(ticks: FundingTick[]): Promise<number> {
  // Group latest tick per (venue, base)
  const byBase = new Map<string, Map<Venue, FundingTick>>();
  for (const t of ticks) {
    const base = normalizeBase(t.venue as Venue, t.symbol);
    if (!base) continue;
    const inner = byBase.get(base) ?? new Map();
    const existing = inner.get(t.venue as Venue);
    if (!existing || t.ts > existing.ts) inner.set(t.venue as Venue, t);
    byBase.set(base, inner);
  }

  type OppRow = {
    pair: string;
    long: Venue;
    short: Venue;
    spread_bps: number;
    apr_bps: number;
    detail: object;
  };
  const opps: OppRow[] = [];
  for (const [base, perVenue] of byBase) {
    if (perVenue.size < 2) continue;
    const entries = [...perVenue.entries()].map(([v, t]) => ({
      venue: v,
      apr: fundingApr(t.fundingRate ?? 0, t.fundingIntervalHours),
    }));
    for (const a of entries) {
      for (const b of entries) {
        if (a.venue === b.venue) continue;
        const spread = crossVenueFundingSpread(a.apr, b.apr);
        if (spread <= 0) continue;
        opps.push({
          pair: base,
          long: b.venue, // long the cheaper-funding side
          short: a.venue, // short the more expensive
          spread_bps: spread * 10_000,
          apr_bps: spread * 10_000,
          detail: { aprBpsByVenue: Object.fromEntries(entries.map((e) => [e.venue, e.apr * 10_000])) },
        });
      }
    }
  }

  if (opps.length === 0) return 0;

  const values: unknown[] = [];
  const rows: string[] = [];
  let i = 1;
  for (const o of opps) {
    rows.push(
      `('funding', $${i++}, $${i++}, $${i++}, NULL, $${i++}, $${i++}, $${i++}::jsonb, now())`,
    );
    values.push(o.pair, o.long, o.short, o.spread_bps, o.apr_bps, JSON.stringify(o.detail));
  }
  await pgPool.query(
    `INSERT INTO opportunities
       (category, pair, long_venue, short_venue, chain, spread_bps, apr_bps, detail, computed_at)
     VALUES ${rows.join(",")}
     ON CONFLICT (category, pair, long_venue, short_venue, chain)
     DO UPDATE SET
       spread_bps = EXCLUDED.spread_bps,
       apr_bps    = EXCLUDED.apr_bps,
       detail     = EXCLUDED.detail,
       computed_at = EXCLUDED.computed_at`,
    values,
  );
  return opps.length;
}

export async function runFundingCycle(): Promise<{ ticks: number; opps: number }> {
  const ticks = await pollAllVenues();
  await insertTicks(ticks);
  const opps = await upsertOpportunities(ticks);
  return { ticks: ticks.length, opps };
}
