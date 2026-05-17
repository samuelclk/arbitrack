import { loadLatestPeg } from "../../lib/peg";
import { loadSparklinePoints } from "../../lib/sparkline";
import { Sparkline } from "../../components/Sparkline";

export const dynamic = "force-dynamic";

const fmtPct = (decimal: number, dp = 4) => `${(decimal * 100).toFixed(dp)}%`;

export default async function PegPage() {
  const [peg, sparklinePoints] = await Promise.all([
    loadLatestPeg(),
    loadSparklinePoints("peg", "stETH-ETH"),
  ]);
  if (!peg) return <main data-testid="peg-empty">No peg data yet.</main>;
  return (
    <main>
      <h1>stETH / ETH peg</h1>
      <div>
        <Sparkline points={sparklinePoints} width={200} height={40} />
      </div>
      <table data-testid="peg-detail">
        <tbody>
          <tr><th>implied redeem APR</th><td>{fmtPct(Number(peg.apr_bps) / 10_000, 2)}</td></tr>
          <tr><th>discount vs ETH</th><td>{fmtPct(Number(peg.spread_bps) / 10_000, 4)}</td></tr>
          <tr><th>best stETH price (DEX)</th><td>{peg.detail.bestStethPrice.toFixed(6)}</td></tr>
          <tr><th>wait days (1 ETH)</th><td>{peg.detail.waitDays.toFixed(3)}</td></tr>
          <tr><th>wait type</th><td>{peg.detail.waitType}</td></tr>
          <tr><th>unfinalized stETH (queue)</th><td>{peg.detail.unfinalizedStethEth.toFixed(2)} ETH</td></tr>
          <tr><th>bunker mode</th><td>{peg.detail.bunkerMode ? "yes" : "no"}</td></tr>
          <tr><th>DEX price sources</th><td>{peg.detail.dexPriceCount}</td></tr>
          <tr><th>computed at</th><td>{new Date(peg.computed_at).toISOString()}</td></tr>
        </tbody>
      </table>
    </main>
  );
}
