import { pollFunding } from "../src/adapters/cex/bybit.ts";

const ticks = await pollFunding();
console.log(`bybit funding rows (whitelist): ${ticks.length}`);
for (const t of ticks.slice(0, 10)) {
  console.log(
    `  ${t.symbol}: rate=${t.fundingRate} (${t.fundingIntervalHours}h) ` +
      `markPrice=${t.price} ts=${t.ts.toISOString()}`,
  );
}
