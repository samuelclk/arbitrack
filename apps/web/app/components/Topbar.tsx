import { pgPool } from "../lib/db";

interface TopbarData {
  ethSpot: number | null;
  stethToEth: number | null;
  queueDays: number | null;
  bestLoopAprBps: number | null;
  ethAvgFundingAprBps: number | null;
}

async function loadTopbar(): Promise<TopbarData> {
  const [eth, peg, loop, fundingAvg] = await Promise.all([
    pgPool.query<{ price: string }>(
      `SELECT price FROM ticks
        WHERE venue='binance' AND symbol='ETHUSDT' AND kind='funding'
        ORDER BY ts DESC LIMIT 1`,
    ),
    pgPool.query<{ apr_bps: string; detail: { bestStethPrice: number; waitDays: number } }>(
      `SELECT apr_bps, detail FROM opportunities
        WHERE category='peg' ORDER BY computed_at DESC LIMIT 1`,
    ),
    pgPool.query<{ apr_bps: string }>(
      `SELECT MAX(apr_bps) AS apr_bps FROM opportunities WHERE category='loop'`,
    ),
    pgPool.query<{ avg_bps: string }>(
      `WITH eth_ticks AS (
         SELECT DISTINCT ON (venue, symbol) venue, symbol, funding_rate
           FROM ticks
          WHERE kind='funding'
            AND (symbol IN ('ETH','ETHUSDT','ETH-USDT-SWAP','ETH_USDT_Perp'))
          ORDER BY venue, symbol, ts DESC
       )
       SELECT AVG(funding_rate * 1095 * 10000) AS avg_bps FROM eth_ticks`,
    ),
  ]);

  return {
    ethSpot: eth.rows[0] ? Number(eth.rows[0].price) : null,
    stethToEth: peg.rows[0]?.detail?.bestStethPrice ?? null,
    queueDays: peg.rows[0]?.detail?.waitDays ?? null,
    bestLoopAprBps: loop.rows[0]?.apr_bps ? Number(loop.rows[0].apr_bps) : null,
    ethAvgFundingAprBps: fundingAvg.rows[0]?.avg_bps ? Number(fundingAvg.rows[0].avg_bps) : null,
  };
}

const fmt = (val: number | null, fn: (v: number) => string): string => (val == null ? "—" : fn(val));

export async function Topbar() {
  const d = await loadTopbar();
  return (
    <header
      data-testid="topbar"
      style={{ display: "flex", gap: "1.5rem", padding: "0.5rem 1rem", borderBottom: "1px solid #ccc" }}
    >
      <span data-testid="topbar-eth-spot">ETH ${fmt(d.ethSpot, (v) => v.toFixed(2))}</span>
      <span data-testid="topbar-steth-eth">stETH/ETH {fmt(d.stethToEth, (v) => v.toFixed(6))}</span>
      <span data-testid="topbar-queue-days">queue {fmt(d.queueDays, (v) => `${v.toFixed(2)}d`)}</span>
      <span data-testid="topbar-best-loop">
        best loop {fmt(d.bestLoopAprBps, (v) => `${(v / 100).toFixed(2)}%`)}
      </span>
      <span data-testid="topbar-eth-funding">
        ETH avg funding {fmt(d.ethAvgFundingAprBps, (v) => `${(v / 100).toFixed(2)}%`)}
      </span>
    </header>
  );
}
