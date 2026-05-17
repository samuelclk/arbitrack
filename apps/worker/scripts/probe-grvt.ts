import { pollFunding } from "../src/adapters/cex/grvt.ts";

const ticks = await pollFunding();
console.log(`grvt funding rows: ${ticks.length}`);

let outOfRange = 0;
for (const t of ticks) {
  const aprPct =
    ((t.fundingRate ?? 0) * (24 / t.fundingIntervalHours) * 365) * 100;
  const flag = Math.abs(aprPct) >= 200 ? " ⚠ OUT OF RANGE" : "";
  if (Math.abs(aprPct) >= 200) outOfRange++;
  console.log(
    `  ${t.symbol}: rate=${t.fundingRate} (${t.fundingIntervalHours}h) ` +
      `APR=${aprPct.toFixed(2)}%${flag}`,
  );
}

console.log(
  `\n${ticks.length - outOfRange}/${ticks.length} within (-200%, +200%) APR`,
);
