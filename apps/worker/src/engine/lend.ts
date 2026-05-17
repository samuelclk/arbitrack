import { type LendRate, Venue } from "shared";
import { pgPool } from "../db/client.js";
import { fetchDefillamaLendRates } from "../adapters/defillama/yields.js";
import { fetchAaveV3WethWsteth } from "../adapters/chain/aave-v3.js";
import { fetchSparkWethWsteth } from "../adapters/chain/spark.js";
import {
  fetchMorphoWstethMarkets,
  morphoMarketsToLendRates,
} from "../adapters/chain/morpho-blue.js";

async function gather(): Promise<LendRate[]> {
  const results = await Promise.allSettled([
    fetchDefillamaLendRates(),
    fetchAaveV3WethWsteth(),
    fetchSparkWethWsteth(),
    fetchMorphoWstethMarkets().then(morphoMarketsToLendRates),
  ]);
  const out: LendRate[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(...r.value);
    else console.warn("lend source failed:", r.reason);
  }
  return out;
}

async function insertLendRates(rates: LendRate[]): Promise<void> {
  if (rates.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rates) {
    placeholders.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, ` +
        `$${i++}, $${i++}, $${i++}, $${i++}, $${i++})`,
    );
    values.push(
      r.chain,
      r.venue,
      r.asset,
      r.supplyAprBps ?? null,
      r.borrowAprBps ?? null,
      r.ltvBps ?? null,
      r.lltBps ?? null,
      r.emode,
      r.borrowable,
      r.totalSupplyUsd ?? null,
      r.totalBorrowUsd ?? null,
      r.ts,
    );
  }
  await pgPool.query(
    `INSERT INTO lend_rates
       (chain, venue, asset, supply_apr_bps, borrow_apr_bps, ltv_bps, llt_bps,
        emode, borrowable, total_supply_usd, total_borrow_usd, ts)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (chain, venue, asset, emode, ts) DO NOTHING`,
    values,
  );
}

async function upsertDispersionOpportunities(rates: LendRate[]): Promise<number> {
  // Group by (chain, asset) → find borrow-rate dispersion across venues
  const byKey = new Map<string, LendRate[]>();
  for (const r of rates) {
    if (r.borrowAprBps == null) continue;
    const key = `${r.chain}|${r.asset}`;
    const arr = byKey.get(key) ?? [];
    arr.push(r);
    byKey.set(key, arr);
  }

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let n = 0;
  let i = 1;
  for (const [key, arr] of byKey) {
    if (arr.length < 2) continue;
    const sorted = [...arr].sort((a, b) => (a.borrowAprBps ?? 0) - (b.borrowAprBps ?? 0));
    const cheapest = sorted[0];
    const richest = sorted[sorted.length - 1];
    const spreadBps = (richest.borrowAprBps ?? 0) - (cheapest.borrowAprBps ?? 0);
    if (spreadBps <= 0) continue;
    const [chain, asset] = key.split("|");

    placeholders.push(
      `('lend', $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}::jsonb, now())`,
    );
    values.push(
      `${asset}-${chain}`,
      cheapest.venue, // borrow on cheapest
      richest.venue, // (could lend on richest, but the "short" slot here just indicates the other venue)
      chain,
      spreadBps,
      spreadBps,
      JSON.stringify({
        borrowBpsByVenue: Object.fromEntries(arr.map((r) => [r.venue, r.borrowAprBps])),
      }),
    );
    n++;
  }
  if (n === 0) return 0;

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
  return n;
}

export async function runLendCycle(): Promise<{ rates: number; opps: number }> {
  const rates = await gather();
  await insertLendRates(rates);
  const opps = await upsertDispersionOpportunities(rates);
  return { rates: rates.length, opps };
}
