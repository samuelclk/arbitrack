import "../src/env.ts";
import { fetchCurveStethPrices } from "../src/adapters/chain/curve-steth.ts";

const prices = await fetchCurveStethPrices();
for (const p of prices) {
  const inRange = p.stethToEthPrice > 0.99 && p.stethToEthPrice < 1.001;
  console.log(
    `curve ${p.pool}: 1 stETH → ${p.stethToEthPrice.toFixed(6)} ETH ` +
      `(in (0.99, 1.001): ${inRange ? "yes" : "NO"})`,
  );
}
