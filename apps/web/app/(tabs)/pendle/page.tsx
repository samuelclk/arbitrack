import { pgPool } from "../../lib/db";

export const dynamic = "force-dynamic";

interface PendleOppRow {
  id: string;
  chain: string;
  spread_bps: string;
  apr_bps: string;
  detail: {
    marketAddr: string;
    expiry: string;
    ptImpliedApy: number;
    borrowVenue: string;
    wstethBorrowApr: number;
    liquidityUsd: number | null;
  };
}

async function loadPendleOpps(): Promise<PendleOppRow[]> {
  const { rows } = await pgPool.query<PendleOppRow>(
    `SELECT id::text, chain, spread_bps, apr_bps, detail
       FROM opportunities
      WHERE category = 'pendle'
   ORDER BY apr_bps DESC NULLS LAST`,
  );
  return rows;
}

const fmtPct = (decimal: number, dp = 2) => `${(decimal * 100).toFixed(dp)}%`;

export default async function PendlePage() {
  const rows = await loadPendleOpps();
  return (
    <main>
      <h1>Pendle wstETH PT vs borrow</h1>
      <p data-testid="row-count">{rows.length} rows</p>
      <table>
        <thead>
          <tr>
            <th>market</th>
            <th>chain</th>
            <th>expiry</th>
            <th>PT APY</th>
            <th>wstETH borrow APR</th>
            <th>spread</th>
            <th>liquidity</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              data-testid="pendle-row"
              data-chain={r.chain}
              data-market={r.detail.marketAddr}
              data-pt-apy={r.detail.ptImpliedApy}
            >
              <td>
                <code>{r.detail.marketAddr.slice(0, 10)}…</code>
              </td>
              <td>{r.chain}</td>
              <td>{r.detail.expiry.slice(0, 10)}</td>
              <td>{fmtPct(r.detail.ptImpliedApy)}</td>
              <td>
                {fmtPct(r.detail.wstethBorrowApr)} ({r.detail.borrowVenue})
              </td>
              <td>{fmtPct(Number(r.spread_bps) / 10_000)}</td>
              <td>
                {r.detail.liquidityUsd == null
                  ? "—"
                  : `$${Math.round(r.detail.liquidityUsd).toLocaleString()}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
