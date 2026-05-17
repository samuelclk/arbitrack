import { pgPool } from "../../lib/db";

export const dynamic = "force-dynamic";

interface LoopRow {
  id: string;
  long_venue: string;
  chain: string;
  apr_bps: string;
  detail: {
    venue: string;
    chain: string;
    leverage: number;
    stethApr: number;
    borrowApr: number;
    lltv: number;
    source: string;
  };
}

async function loadLoops(): Promise<LoopRow[]> {
  const { rows } = await pgPool.query<LoopRow>(
    `SELECT id::text, long_venue, chain, apr_bps, detail
       FROM opportunities
      WHERE category = 'loop'
   ORDER BY apr_bps DESC NULLS LAST`,
  );
  return rows;
}

const fmtPct = (decimal: number, dp = 2) => `${(decimal * 100).toFixed(dp)}%`;

export default async function LoopsPage() {
  const rows = await loadLoops();
  return (
    <main>
      <h1>ETH Loops (wstETH collateral / ETH borrow)</h1>
      <p data-testid="row-count">{rows.length} rows</p>
      <table>
        <thead>
          <tr>
            <th>venue</th>
            <th>chain</th>
            <th>leverage</th>
            <th>stETH APR</th>
            <th>borrow APR</th>
            <th>LLTV</th>
            <th>health buffer</th>
            <th>net APR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const buffer = r.detail.lltv * 0.2; // unused 20% of LLTV
            return (
              <tr
                key={r.id}
                data-testid="loop-row"
                data-venue={r.detail.venue}
                data-chain={r.detail.chain}
                data-net-apr-bps={r.apr_bps}
              >
                <td>{r.detail.venue}</td>
                <td>{r.detail.chain}</td>
                <td>{r.detail.leverage.toFixed(2)}x</td>
                <td>{fmtPct(r.detail.stethApr)}</td>
                <td>{fmtPct(r.detail.borrowApr)}</td>
                <td>{fmtPct(r.detail.lltv)}</td>
                <td>{fmtPct(buffer)}</td>
                <td>{fmtPct(Number(r.apr_bps) / 10_000)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
