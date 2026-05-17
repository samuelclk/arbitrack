const DATA_SOURCES = [
  "Binance, Bybit, OKX, Hyperliquid, Lighter, Aster, GRVT, Deribit",
  "DefiLlama Yields, Aave v3, Morpho Blue, Spark, Compound v3",
  "Lido (eth-api, wq-api, on-chain), Curve, Uniswap v3, Balancer",
  "Pendle v2",
];

export function Footer() {
  return (
    <footer data-testid="footer">
      <hr />
      <p>
        <strong>Data sources:</strong> {DATA_SOURCES.join(" · ")}
      </p>
      <p>
        ArbiTrack surfaces public market data for research and monitoring. Numbers
        are derived from third-party APIs and on-chain reads and may be stale or
        incorrect. <strong>Not investment advice.</strong>
      </p>
    </footer>
  );
}
