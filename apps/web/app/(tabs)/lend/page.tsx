import { pgPool } from "../../lib/db";
import { loadSparklinePoints } from "../../lib/sparkline";
import { Sparkline } from "../../components/Sparkline";

export const dynamic = "force-dynamic";

interface LendRow {
  chain: string;
  venue: string;
  asset: string;
  supply_apr_bps: string | null;
  borrow_apr_bps: string | null;
  ltv_bps: string | null;
  llt_bps: string | null;
  total_supply_usd: string | null;
  total_borrow_usd: string | null;
  ts: string;
}

async function loadLatestLendRates(): Promise<LendRow[]> {
  const { rows } = await pgPool.query<LendRow>(
    `SELECT DISTINCT ON (chain, venue, asset, emode)
       chain, venue, asset, supply_apr_bps, borrow_apr_bps,
       ltv_bps, llt_bps, total_supply_usd, total_borrow_usd, ts
     FROM lend_rates
     ORDER BY chain, venue, asset, emode, ts DESC`,
  );
  return rows
    .filter((r) => r.borrow_apr_bps != null)
    .sort((a, b) => Number(a.borrow_apr_bps) - Number(b.borrow_apr_bps));
}

const fmtPct = (bps: string | null): string =>
  bps == null ? "—" : `${(Number(bps) / 100).toFixed(2)}%`;

export default async function LendPage() {
  const rows = await loadLatestLendRates();
  // Lend rollup is keyed by `${asset}-${chain}` per engine/lend.ts
  const sparks = await Promise.all(
    rows.map((r) => loadSparklinePoints("lend", `${r.asset}-${r.chain}`)),
  );
  return (
    <main>
      <h1>Lending rates</h1>
      <p data-testid="row-count">{rows.length} rows</p>
      <table>
        <thead>
          <tr>
            <th>chain</th>
            <th>venue</th>
            <th>asset</th>
            <th>supply APR</th>
            <th>borrow APR</th>
            <th>LTV</th>
            <th>LLT</th>
            <th>24h</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={`${r.chain}-${r.venue}-${r.asset}-${idx}`}
              data-testid="lend-row"
              data-chain={r.chain}
              data-venue={r.venue}
              data-asset={r.asset}
            >
              <td>{r.chain}</td>
              <td>{r.venue}</td>
              <td>{r.asset}</td>
              <td>{fmtPct(r.supply_apr_bps)}</td>
              <td>{fmtPct(r.borrow_apr_bps)}</td>
              <td>{fmtPct(r.ltv_bps)}</td>
              <td>{fmtPct(r.llt_bps)}</td>
              <td><Sparkline points={sparks[idx]} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
