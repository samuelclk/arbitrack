import { pollFunding } from "../src/adapters/cex/okx.ts";

const ticks = await pollFunding();
console.log(`okx funding rows (whitelist): ${ticks.length}`);
for (const t of ticks.slice(0, 10)) {
  console.log(
    `  ${t.symbol}: rate=${t.fundingRate} (${t.fundingIntervalHours}h) ts=${t.ts.toISOString()}`,
  );
}
