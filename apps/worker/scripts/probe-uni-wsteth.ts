import "../src/env.ts";
import { fetchUniV3WstethPrices } from "../src/adapters/chain/uni-v3-wsteth.ts";

const prices = await fetchUniV3WstethPrices();
for (const p of prices) {
  console.log(
    `uni v3 ${p.pool}: 1 wstETH → ${p.wethPerWsteth.toFixed(6)} WETH ` +
      `(ETH per stETH = ${p.ethPerSteth.toFixed(6)})`,
  );
}
