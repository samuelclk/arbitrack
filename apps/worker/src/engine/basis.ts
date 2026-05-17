import { Venue } from "shared";
import { pgPool } from "../db/client.js";
import { pollQuarterly as pollBinance } from "../adapters/cex/binance.js";
import { pollQuarterly as pollOkx } from "../adapters/cex/okx.js";
import { pollQuarterly as pollDeribit } from "../adapters/cex/deribit.js";

interface BasisRow {
  venue: Venue;
  symbol: string;
  baseAsset: string;
  futPrice: number;
  spotPrice: number;
  expiry: Date;
  basisApr: number;
  ts: Date;
}

function symbolToBase(venue: Venue, symbol: string): string {
  // Binance COIN-M: BTCUSD_260626 → BTC
  if (venue === Venue.Binance) return symbol.split("USD")[0] || symbol;
  // OKX: BTC-USDT-260626 → BTC
  if (venue === Venue.OKX) return symbol.split("-")[0] || symbol;
  // Deribit: BTC-25SEP26 → BTC
  if (venue === Venue.Deribit) return symbol.split("-")[0] || symbol;
  return symbol;
}

async function gather(): Promise<BasisRow[]> {
  const [binance, okx, deribit] = await Promise.allSettled([
    pollBinance(),
    pollOkx(),
    pollDeribit(),
  ]);

  const out: BasisRow[] = [];
  if (binance.status === "fulfilled") {
    for (const t of binance.value) {
      out.push({
        venue: Venue.Binance,
        symbol: t.symbol,
        baseAsset: symbolToBase(Venue.Binance, t.symbol),
        futPrice: t.price ?? 0,
        spotPrice: t.spotPrice,
        expiry: t.expiry ?? new Date(t.expiryMs),
        basisApr: t.basisApr,
        ts: t.ts,
      });
    }
  } else {
    console.warn("binance quarterly failed:", binance.reason);
  }
  if (okx.status === "fulfilled") {
    for (const t of okx.value) {
      out.push({
        venue: Venue.OKX,
        symbol: t.symbol,
        baseAsset: symbolToBase(Venue.OKX, t.symbol),
        futPrice: t.price ?? 0,
        spotPrice: t.spotPrice,
        expiry: t.expiry ?? new Date(t.expiryMs),
        basisApr: t.basisApr,
        ts: t.ts,
      });
    }
  } else {
    console.warn("okx quarterly failed:", okx.reason);
  }
  if (deribit.status === "fulfilled") {
    for (const t of deribit.value) {
      out.push({
        venue: Venue.Deribit,
        symbol: t.symbol,
        baseAsset: symbolToBase(Venue.Deribit, t.symbol),
        futPrice: t.price ?? 0,
        spotPrice: t.indexPrice,
        expiry: t.expiry ?? new Date(t.expiryMs),
        basisApr: t.basisApr,
        ts: t.ts,
      });
    }
  } else {
    console.warn("deribit quarterly failed:", deribit.reason);
  }
  return out;
}

async function insertQuarterlyFutures(rows: BasisRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rows) {
    placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
    values.push(r.venue, r.symbol, r.expiry, r.futPrice, r.spotPrice, r.ts);
  }
  await pgPool.query(
    `INSERT INTO quarterly_futures (venue, symbol, expiry, fut_price, spot_price, ts)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (venue, symbol, ts) DO NOTHING`,
    values,
  );
}

async function upsertOpportunities(rows: BasisRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rows) {
    const aprBps = r.basisApr * 10_000;
    const pair = `${r.baseAsset}-${r.expiry.toISOString().slice(0, 10)}`;
    placeholders.push(
      `('basis', $${i++}, $${i++}, NULL, NULL, $${i++}, $${i++}, $${i++}::jsonb, now())`,
    );
    values.push(
      pair,
      r.venue,
      aprBps,
      aprBps,
      JSON.stringify({
        symbol: r.symbol,
        futPrice: r.futPrice,
        spotPrice: r.spotPrice,
        expiry: r.expiry.toISOString(),
      }),
    );
  }
  await pgPool.query(
    `INSERT INTO opportunities
       (category, pair, long_venue, short_venue, chain, spread_bps, apr_bps, detail, computed_at)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (category, pair, long_venue, short_venue, chain)
     DO UPDATE SET
       spread_bps  = EXCLUDED.spread_bps,
       apr_bps     = EXCLUDED.apr_bps,
       detail      = EXCLUDED.detail,
       computed_at = EXCLUDED.computed_at`,
    values,
  );
  return rows.length;
}

export async function runBasisCycle(): Promise<{ ticks: number; opps: number }> {
  const rows = await gather();
  await insertQuarterlyFutures(rows);
  const opps = await upsertOpportunities(rows);
  return { ticks: rows.length, opps };
}
