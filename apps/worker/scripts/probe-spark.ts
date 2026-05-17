import "../src/env.ts";
import { fetchSparkWethWsteth } from "../src/adapters/chain/spark.ts";

const rows = await fetchSparkWethWsteth();
console.log(`spark mainnet rows: ${rows.length}`);
for (const r of rows) {
  console.log(
    `  ${r.asset.padEnd(7)} LLT=${(r.lltBps ?? 0) / 100}% LTV=${(r.ltvBps ?? 0) / 100}% ` +
      `supply=${((r.supplyAprBps ?? 0) / 100).toFixed(2)}% ` +
      `borrow=${((r.borrowAprBps ?? 0) / 100).toFixed(2)}%`,
  );
}
