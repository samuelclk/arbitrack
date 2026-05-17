import { pollFunding } from "../src/adapters/cex/lighter.ts";

const ticks = await pollFunding();
console.log(`lighter funding rows (DEX-native): ${ticks.length}`);
const required = ["BTC", "ETH", "SOL"];
const present = new Set(ticks.map((t) => t.symbol));
for (const r of required) {
  console.log(`  ${r}: ${present.has(r) ? "present" : "MISSING"}`);
}
for (const t of ticks.slice(0, 10)) {
  const annualPct = (t.fundingRate ?? 0) * 8760 * 100;
  console.log(
    `  ${t.symbol} (mid=${t.marketId}): rate=${t.fundingRate} (1h) annualized=${annualPct.toFixed(2)}%`,
  );
}
