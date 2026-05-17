import { pollQuarterly } from "../src/adapters/cex/okx.ts";

const ticks = await pollQuarterly();
console.log(`okx quarterly contracts: ${ticks.length}`);
for (const t of ticks) {
  const days = ((t.expiryMs - Date.now()) / 86_400_000).toFixed(1);
  console.log(
    `  ${t.symbol}: fut=${t.price} spot=${t.spotPrice} ` +
      `days=${days} basis_apr=${(t.basisApr * 100).toFixed(2)}%`,
  );
}
