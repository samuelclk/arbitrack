import { fetchPendleWstethMarkets } from "../src/adapters/pendle/markets.ts";

const markets = await fetchPendleWstethMarkets();
console.log(`wstETH Pendle markets: ${markets.length}`);
for (const m of markets) {
  console.log(
    `  ${m.chain} ${m.marketAddr} expiry=${m.expiry.toISOString().slice(0, 10)} ` +
      `impliedApy=${(m.ptImpliedApyBps / 100).toFixed(2)}% ` +
      `liquidity=$${m.liquidityUsd?.toLocaleString() ?? "—"}`,
  );
}
