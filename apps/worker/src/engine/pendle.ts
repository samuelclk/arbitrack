import { pendleSpread } from "shared";
import { pgPool } from "../db/client.js";
import { fetchPendleWstethMarkets } from "../adapters/pendle/markets.js";

async function loadCheapestWstethBorrow(): Promise<Map<string, { venue: string; aprDecimal: number }>> {
  // Latest borrow APR per (chain, venue) where asset='wstETH', borrowable.
  const { rows } = await pgPool.query<{ chain: string; venue: string; borrow_apr_bps: string }>(
    `SELECT DISTINCT ON (chain, venue) chain, venue, borrow_apr_bps
       FROM lend_rates
      WHERE asset = 'wstETH' AND borrow_apr_bps IS NOT NULL AND borrow_apr_bps > 0
      ORDER BY chain, venue, ts DESC`,
  );
  const cheapestByChain = new Map<string, { venue: string; aprDecimal: number }>();
  for (const r of rows) {
    const apr = Number(r.borrow_apr_bps) / 10_000;
    const existing = cheapestByChain.get(r.chain);
    if (!existing || apr < existing.aprDecimal) {
      cheapestByChain.set(r.chain, { venue: r.venue, aprDecimal: apr });
    }
  }
  return cheapestByChain;
}

async function insertPendleMarkets(
  markets: Awaited<ReturnType<typeof fetchPendleWstethMarkets>>,
): Promise<void> {
  if (markets.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  for (const m of markets) {
    placeholders.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`,
    );
    values.push(
      m.chain,
      m.marketAddr,
      m.underlying,
      m.expiry,
      m.ptImpliedApyBps,
      m.ytFloatingApyBps ?? null,
      m.liquidityUsd ?? null,
      m.ts,
    );
  }
  await pgPool.query(
    `INSERT INTO pendle_markets
       (chain, market_addr, underlying, expiry, pt_implied_apy_bps,
        yt_floating_apy_bps, liquidity_usd, ts)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (chain, market_addr, ts) DO NOTHING`,
    values,
  );
}

export async function runPendleCycle(): Promise<{ markets: number; opps: number }> {
  const [markets, cheapestByChain] = await Promise.all([
    fetchPendleWstethMarkets(),
    loadCheapestWstethBorrow(),
  ]);
  await insertPendleMarkets(markets);

  const values: unknown[] = [];
  const placeholders: string[] = [];
  let i = 1;
  let n = 0;
  for (const m of markets) {
    const cheap = cheapestByChain.get(m.chain);
    if (!cheap) continue; // no wstETH borrow rate available for this chain → skip
    const ptApy = m.ptImpliedApyBps / 10_000;
    const spread = pendleSpread(ptApy, cheap.aprDecimal);
    const spreadBps = spread * 10_000;

    const pair = `wstETH-PT-${m.expiry.toISOString().slice(0, 10)}`;
    placeholders.push(
      `('pendle', $${i++}, $${i++}, NULL, $${i++}, $${i++}, $${i++}, $${i++}::jsonb, now())`,
    );
    values.push(
      pair,
      cheap.venue, // long PT, borrow wstETH on cheapest venue
      m.chain,
      spreadBps,
      spreadBps,
      JSON.stringify({
        marketAddr: m.marketAddr,
        expiry: m.expiry.toISOString(),
        ptImpliedApy: ptApy,
        borrowVenue: cheap.venue,
        wstethBorrowApr: cheap.aprDecimal,
        liquidityUsd: m.liquidityUsd,
      }),
    );
    n++;
  }

  if (n > 0) {
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
  }

  return { markets: markets.length, opps: n };
}
