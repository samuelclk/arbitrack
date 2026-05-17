import { netLoopApr, safeLeverage } from "shared";
import { pgPool } from "../db/client.js";
import { fetchStethApr } from "../adapters/lido/apr.js";

interface VenueChainPair {
  venue: string;
  chain: string;
  lltvDecimal: number;
  borrowAprDecimal: number;
}

async function loadVenueChainPairs(): Promise<VenueChainPair[]> {
  // For each (venue, chain), grab wstETH llt + WETH borrow APR from latest ticks.
  const sql = `
    WITH latest AS (
      SELECT DISTINCT ON (chain, venue, asset, emode)
        chain, venue, asset, llt_bps, borrow_apr_bps
      FROM lend_rates
      ORDER BY chain, venue, asset, emode, ts DESC
    ),
    wsteth AS (
      SELECT chain, venue, llt_bps FROM latest
       WHERE asset = 'wstETH' AND llt_bps IS NOT NULL AND llt_bps > 0
    ),
    weth AS (
      SELECT chain, venue, borrow_apr_bps FROM latest
       WHERE asset = 'WETH' AND borrow_apr_bps IS NOT NULL
    )
    SELECT w.chain, w.venue, w.llt_bps, e.borrow_apr_bps
      FROM wsteth w JOIN weth e ON w.chain = e.chain AND w.venue = e.venue;
  `;
  const { rows } = await pgPool.query<{
    chain: string;
    venue: string;
    llt_bps: string;
    borrow_apr_bps: string;
  }>(sql);
  return rows.map((r) => ({
    chain: r.chain,
    venue: r.venue,
    lltvDecimal: Number(r.llt_bps) / 10_000,
    borrowAprDecimal: Number(r.borrow_apr_bps) / 10_000,
  }));
}

export async function runLoopCycle(): Promise<{ pairs: number; opps: number }> {
  const [stethApr, pairs] = await Promise.all([fetchStethApr(), loadVenueChainPairs()]);
  if (pairs.length === 0) return { pairs: 0, opps: 0 };

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  let count = 0;
  for (const p of pairs) {
    // Some Aave reserves return LLT > 1.25 due to bitmap quirks (unlikely but safe)
    if (p.lltvDecimal <= 0 || p.lltvDecimal >= 1.25) continue;
    const lev = safeLeverage(p.lltvDecimal);
    const net = netLoopApr(lev, stethApr.apr, p.borrowAprDecimal);
    const aprBps = net * 10_000;
    placeholders.push(
      `('loop', $${i++}, $${i++}, NULL, $${i++}, NULL, $${i++}, $${i++}::jsonb, now())`,
    );
    values.push(
      `wstETH-ETH`,
      p.venue,
      p.chain,
      aprBps,
      JSON.stringify({
        venue: p.venue,
        chain: p.chain,
        leverage: lev,
        stethApr: stethApr.apr,
        borrowApr: p.borrowAprDecimal,
        lltv: p.lltvDecimal,
        source: stethApr.source,
      }),
    );
    count++;
  }
  if (count === 0) return { pairs: pairs.length, opps: 0 };

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

  // Also write stETH APR snapshot for transparency
  await pgPool.query(
    `INSERT INTO steth_apr (ts, apr_bps, source) VALUES ($1, $2, $3) ON CONFLICT (ts) DO NOTHING`,
    [stethApr.ts, stethApr.apr * 10_000, stethApr.source],
  );

  return { pairs: pairs.length, opps: count };
}
