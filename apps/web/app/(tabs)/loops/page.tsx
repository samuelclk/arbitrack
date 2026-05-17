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
            const d = r.detail ?? ({} as LoopRow["detail"]);
            const buffer = (d.lltv ?? 0) * 0.2;
            return (
              <tr
                key={r.id}
                data-testid="loop-row"
                data-venue={d.venue ?? r.long_venue ?? "—"}
                data-chain={d.chain ?? r.chain ?? "—"}
                data-net-apr-bps={r.apr_bps}
              >
                <td>{d.venue ?? r.long_venue ?? "—"}</td>
                <td>{d.chain ?? r.chain ?? "—"}</td>
                <td>{d.leverage != null ? `${d.leverage.toFixed(2)}x` : "—"}</td>
                <td>{d.stethApr != null ? fmtPct(d.stethApr) : "—"}</td>
                <td>{d.borrowApr != null ? fmtPct(d.borrowApr) : "—"}</td>
                <td>{d.lltv != null ? fmtPct(d.lltv) : "—"}</td>
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
