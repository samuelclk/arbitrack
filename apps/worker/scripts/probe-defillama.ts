import { fetchDefillamaLendRates } from "../src/adapters/defillama/yields.js";

const rates = await fetchDefillamaLendRates();
const byChain = new Map<string, number>();
for (const r of rates) byChain.set(r.chain, (byChain.get(r.chain) ?? 0) + 1);

console.log(`total pools: ${rates.length}`);
for (const [chain, n] of byChain) console.log(`  ${chain}: ${n}`);
console.log("sample:", rates.slice(0, 3));
