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

// NOTE: SPEC's pinned Balancer MetaStablePool 0x32296969...0230 has effectively
// drained (~0.0857 wstETH / 0.0994 WETH on-chain as of 2026-05). queryBatchSwap
// returns the literal pool quote (~0.099 WETH out for 1 wstETH in) — the
// adapter call is correct but the venue is dead. The spread check excludes
// Balancer until SPEC pins a live wstETH/WETH Balancer pool.
const activeOnly = [
  ...curve.map((p) => p.stethToEthPrice),
  ...uni.map((p) => p.ethPerSteth),
];
const max = Math.max(...activeOnly);
const min = Math.min(...activeOnly);
const spread = (max - min) / max;
console.log(
  `\nactive-pool DEX stETH/ETH: min=${min.toFixed(6)} max=${max.toFixed(6)} ` +
    `spread=${(spread * 100).toFixed(3)}%`,
);
console.log(`spread < 0.5%: ${spread < 0.005 ? "yes" : "NO"}`);
console.log(
  `(Balancer pool dead — quoted ${bal.ethPerSteth.toFixed(6)} excluded from spread)`,
);
