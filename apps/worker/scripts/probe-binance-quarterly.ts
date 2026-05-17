import { pollQuarterly } from "../src/adapters/cex/binance.ts";

const ticks = await pollQuarterly(["BTC", "ETH", "SOL"]);
console.log(`binance quarterly contracts: ${ticks.length}`);
for (const t of ticks) {
  const days = ((t.expiryMs - Date.now()) / 86_400_000).toFixed(1);
  console.log(
    `  ${t.symbol} (${t.contractType}): fut=${t.price} spot=${t.spotPrice} ` +
      `days=${days} basis_apr=${(t.basisApr * 100).toFixed(2)}%`,
  );
}
const btcContracts = ticks.filter((t) => t.symbol.startsWith("BTCUSD_"));
console.log(`\nBTC contracts: ${btcContracts.length}`);
