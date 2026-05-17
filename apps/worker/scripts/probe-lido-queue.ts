import "../src/env.ts";
import { fetchLidoQueue } from "../src/adapters/lido/queue.ts";

const q = await fetchLidoQueue();
console.log(`unfinalized stETH: ${q.unfinalizedSteth.toFixed(2)} ETH`);
console.log(`last request id:   ${q.lastRequestId}`);
console.log(`last finalized id: ${q.lastFinalizedRequestId}`);
console.log(`bunker mode:       ${q.bunkerMode}`);
console.log(`non-zero queue:    ${q.unfinalizedStethWei > 0n ? "yes" : "NO"}`);
