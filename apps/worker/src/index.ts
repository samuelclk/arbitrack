import "./env.js";
import { pgPool } from "./db/client.js";
import { runFundingCycle } from "./engine/funding.js";
import { runBasisCycle } from "./engine/basis.js";

const TICK_INTERVAL_MS = 10_000;
const RUN_DURATION_MS = Number(process.env.WORKER_RUN_DURATION_MS ?? "30000");

console.log("worker up");

const started = Date.now();
let stop = false;

async function loop() {
  while (!stop && Date.now() - started < RUN_DURATION_MS) {
    const t0 = Date.now();
    const [funding, basis] = await Promise.allSettled([runFundingCycle(), runBasisCycle()]);
    if (funding.status === "fulfilled") {
      console.log(`funding: ticks=${funding.value.ticks} opps=${funding.value.opps}`);
    } else console.error("funding cycle failed:", funding.reason);
    if (basis.status === "fulfilled") {
      console.log(`basis:   ticks=${basis.value.ticks} opps=${basis.value.opps}`);
    } else console.error("basis cycle failed:", basis.reason);

    const elapsed = Date.now() - t0;
    const wait = Math.max(0, TICK_INTERVAL_MS - elapsed);
    if (Date.now() - started + wait < RUN_DURATION_MS) {
      await new Promise((r) => setTimeout(r, wait));
    } else break;
  }
}

await loop();
await pgPool.end();
console.log("worker stopped");
