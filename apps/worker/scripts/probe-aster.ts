import { pollFunding } from "../src/adapters/cex/aster.ts";

const ticks = await pollFunding();
console.log(`aster funding rows (whitelist): ${ticks.length}`);
for (const t of ticks.slice(0, 10)) {
  console.log(
    `  ${t.symbol}: rate=${t.fundingRate} (${t.fundingIntervalHours}h) ` +
      `markPrice=${t.price} ts=${t.ts.toISOString()}`,
  );
}
