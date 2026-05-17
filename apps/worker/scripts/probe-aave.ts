import "../src/env.ts";
import { fetchAaveV3WethWsteth } from "../src/adapters/chain/aave-v3.ts";

const rows = await fetchAaveV3WethWsteth();
console.log(`aave v3 rows: ${rows.length}`);
for (const r of rows) {
  console.log(
    `  ${r.chain.padEnd(10)} ${r.asset.padEnd(7)} ` +
      `LLT=${(r.lltBps ?? 0) / 100}% ` +
      `LTV=${(r.ltvBps ?? 0) / 100}% ` +
      `supply=${((r.supplyAprBps ?? 0) / 100).toFixed(2)}% ` +
      `borrow=${((r.borrowAprBps ?? 0) / 100).toFixed(2)}%`,
  );
}
