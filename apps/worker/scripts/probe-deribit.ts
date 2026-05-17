import { pollQuarterly } from "../src/adapters/cex/deribit.ts";

const ticks = await pollQuarterly();
console.log(`deribit quarterly contracts (BTC+ETH): ${ticks.length}`);
for (const t of ticks) {
  const days = ((t.expiryMs - Date.now()) / 86_400_000).toFixed(1);
  console.log(
    `  ${t.symbol} (${t.settlementPeriod}): fut=${t.price} ` +
      `index=${t.indexPrice} days=${days} basis_apr=${(t.basisApr * 100).toFixed(2)}%`,
  );
}
