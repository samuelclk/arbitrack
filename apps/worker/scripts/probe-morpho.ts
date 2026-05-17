import { fetchMorphoWstethMarkets } from "../src/adapters/chain/morpho-blue.ts";

const markets = await fetchMorphoWstethMarkets();
console.log(`total wstETH-collateral markets: ${markets.length}`);
for (const m of markets.slice(0, 10)) {
  console.log(
    `  ${m.chain} ${m.collateralSymbol}/${m.loanSymbol} ` +
      `lltv=${(m.lltvBps / 100).toFixed(2)}% ` +
      `borrowApy=${m.borrowAprBps == null ? "—" : (m.borrowAprBps / 100).toFixed(2) + "%"}`,
  );
}
