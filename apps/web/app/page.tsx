import { loadLatestPeg } from "./lib/peg";

export const dynamic = "force-dynamic";

const fmtPct = (decimal: number, dp = 2) => `${(decimal * 100).toFixed(dp)}%`;

export default async function Page() {
  const peg = await loadLatestPeg();
  return (
    <main>
      <h1>ArbiTrack</h1>
      {peg ? (
        <section data-testid="hero">
          <h2>Implied Redeem APR</h2>
          <p data-testid="hero-apr" style={{ fontSize: "2rem" }}>
            {fmtPct(Number(peg.apr_bps) / 10_000)}
          </p>
          <p>
            best stETH price: {peg.detail.bestStethPrice.toFixed(6)} ·{" "}
            wait: {peg.detail.waitDays.toFixed(2)} days ·{" "}
            queue: {Math.round(peg.detail.unfinalizedStethEth).toLocaleString()} stETH
          </p>
        </section>
      ) : (
        <p data-testid="hero">No peg data yet.</p>
      )}
    </main>
  );
}
