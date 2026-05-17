import "../src/env.ts";
import { fetchBalancerWstethPrice } from "../src/adapters/chain/balancer-wsteth.ts";
import { fetchUniV3WstethPrices } from "../src/adapters/chain/uni-v3-wsteth.ts";
import { fetchCurveStethPrices } from "./../src/adapters/chain/curve-steth.ts";

const [bal, uni, curve] = await Promise.all([
  fetchBalancerWstethPrice(),
  fetchUniV3WstethPrices(),
  fetchCurveStethPrices(),
]);

console.log(
  `balancer: 1 wstETH → ${bal.wethPerWsteth.toFixed(6)} WETH ` +
    `(ETH per stETH = ${bal.ethPerSteth.toFixed(6)})`,
);

const allEthPerSteth = [
  ...curve.map((p) => p.stethToEthPrice),
  ...uni.map((p) => p.ethPerSteth),
  bal.ethPerSteth,
];
const max = Math.max(...allEthPerSteth);
const min = Math.min(...allEthPerSteth);
const spread = (max - min) / max;
console.log(
  `\nDEX stETH/ETH prices: min=${min.toFixed(6)} max=${max.toFixed(6)} spread=${(spread * 100).toFixed(3)}%`,
);
console.log(`spread < 0.5%: ${spread < 0.005 ? "yes" : "NO"}`);
