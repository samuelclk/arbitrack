import "./env.js";
import { pgPool } from "./db/client.js";
import { runFundingCycle } from "./engine/funding.js";

const TICK_INTERVAL_MS = 10_000;
const RUN_DURATION_MS = Number(process.env.WORKER_RUN_DURATION_MS ?? "30000");

console.log("worker up");

const started = Date.now();
let stop = false;

async function loop() {
  while (!stop && Date.now() - started < RUN_DURATION_MS) {
    const t0 = Date.now();
    try {
      const r = await runFundingCycle();
      console.log(`funding cycle: ticks=${r.ticks} opps=${r.opps}`);
    } catch (err) {
      console.error("funding cycle failed:", err);
    }
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
