import "../src/env.ts";
import { fetchStethApr } from "../src/adapters/lido/apr.ts";

const result = await fetchStethApr();
const pct = result.apr * 100;
console.log(`stETH APR: ${pct.toFixed(3)}% (source: ${result.source})`);
console.log(`in range (2%, 6%): ${pct > 2 && pct < 6 ? "yes" : "NO"}`);
