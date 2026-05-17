import { pollFunding } from "../src/adapters/cex/hyperliquid.ts";

const ticks = await pollFunding();
console.log(`hyperliquid funding rows (whitelist): ${ticks.length}`);
for (const t of ticks.slice(0, 10)) {
  // SPEC §2.1: Hyperliquid funding is hourly — annualize × 8760
  const annualPct = (t.fundingRate ?? 0) * 8760 * 100;
  console.log(
    `  ${t.symbol}: rate=${t.fundingRate} (1h) markPrice=${t.price} ` +
      `annualized=${annualPct.toFixed(2)}%`,
  );
}
