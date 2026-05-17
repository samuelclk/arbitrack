import { impliedRedeemApr } from "shared";
import { pgPool } from "../db/client.js";
import { fetchLidoQueue } from "../adapters/lido/queue.js";
import { fetchLidoWaitTime } from "../adapters/lido/wait-time.js";
import { fetchCurveStethPrices } from "../adapters/chain/curve-steth.js";
import { fetchUniV3WstethPrices } from "../adapters/chain/uni-v3-wsteth.js";

interface DexPriceRow {
  chain: string;
  dex: string;
  pool: string;
  base: string;
  quote: string;
  price: number;
  ts: Date;
}

async function gatherStethDexPrices(): Promise<{ rows: DexPriceRow[]; bestSteth: number }> {
  const [curve, uni] = await Promise.all([fetchCurveStethPrices(), fetchUniV3WstethPrices()]);
  const ts = new Date();
  const rows: DexPriceRow[] = [];
  for (const p of curve) {
    rows.push({
      chain: "mainnet",
      dex: p.pool === "old" ? "curve" : "curve-ng",
      pool: p.poolAddr,
      base: "stETH",
      quote: "ETH",
      price: p.stethToEthPrice,
      ts,
    });
  }
  for (const p of uni) {
    rows.push({
      chain: "mainnet",
      dex: "uni-v3",
      pool: p.poolAddr,
      base: "stETH",
      quote: "ETH",
      price: p.ethPerSteth,
      ts,
    });
  }
  // Best stETH price = highest (closest to 1.0); arb takes the most generous DEX
  const bestSteth = rows.length === 0 ? 1 : Math.max(...rows.map((r) => r.price));
  return { rows, bestSteth };
}

async function insertDexPrices(rows: DexPriceRow[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const r of rows) {
    placeholders.push(`($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`);
    values.push(r.chain, r.dex, r.pool, r.base, r.quote, r.price, r.ts);
  }
  await pgPool.query(
    `INSERT INTO dex_prices (chain, dex, pool, base, quote, price, ts)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (chain, dex, pool, ts) DO NOTHING`,
    values,
  );
}

async function insertLidoQueueRow(q: Awaited<ReturnType<typeof fetchLidoQueue>>, estWaitDays: number): Promise<void> {
  await pgPool.query(
    `INSERT INTO lido_queue
       (ts, unfinalized_steth, last_request_id, last_finalized_id, est_wait_days,
        bunker_mode, wait_source_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (ts) DO NOTHING`,
    [
      q.ts,
      q.unfinalizedSteth,
      q.lastRequestId,
      q.lastFinalizedRequestId,
      estWaitDays,
      q.bunkerMode,
      null,
    ],
  );
}

export async function runPegCycle(): Promise<{ aprBps: number; bestSteth: number; waitDays: number }> {
  const [queue, wait, dex] = await Promise.all([
    fetchLidoQueue(),
    fetchLidoWaitTime(1),
    gatherStethDexPrices(),
  ]);

  await insertDexPrices(dex.rows);
  await insertLidoQueueRow(queue, wait.waitDays);

  const apr = impliedRedeemApr(dex.bestSteth, Math.max(0.001, wait.waitDays));
  const aprBps = apr * 10_000;
  const discountBps = (1 - dex.bestSteth) * 10_000;

  await pgPool.query(
    `INSERT INTO opportunities
       (category, pair, long_venue, short_venue, chain, spread_bps, apr_bps, detail, computed_at)
     VALUES ('peg', 'stETH-ETH', 'lido-redeem', NULL, 'mainnet', $1, $2, $3::jsonb, now())
     ON CONFLICT (category, pair, long_venue, short_venue, chain)
     DO UPDATE SET
       spread_bps  = EXCLUDED.spread_bps,
       apr_bps     = EXCLUDED.apr_bps,
       detail      = EXCLUDED.detail,
       computed_at = EXCLUDED.computed_at`,
    [
      discountBps,
      aprBps,
      JSON.stringify({
        bestStethPrice: dex.bestSteth,
        waitDays: wait.waitDays,
        waitType: wait.type,
        unfinalizedStethEth: queue.unfinalizedSteth,
        bunkerMode: queue.bunkerMode,
        dexPriceCount: dex.rows.length,
      }),
    ],
  );

  return { aprBps, bestSteth: dex.bestSteth, waitDays: wait.waitDays };
}
