import "./env.js";
import { pgPool } from "./db/client.js";
import { runFundingCycle } from "./engine/funding.js";
import { runBasisCycle } from "./engine/basis.js";
import { runLendCycle } from "./engine/lend.js";
import { runLoopCycle } from "./engine/loop.js";
import { runPendleCycle } from "./engine/pendle.js";
import { runPegCycle } from "./engine/peg.js";
import { runRollupCycle } from "./engine/rollup.js";

const TICK_INTERVAL_MS = 10_000;
// 0 means run forever (production default). For verification / local testing,
// set WORKER_RUN_DURATION_MS=30000 to exit after 30s.
const RUN_DURATION_MS = Number(process.env.WORKER_RUN_DURATION_MS ?? "0");
const FOREVER = RUN_DURATION_MS === 0;

console.log("worker up");

const started = Date.now();
let stop = false;
process.on("SIGTERM", () => { stop = true; });
process.on("SIGINT", () => { stop = true; });

async function loop() {
  while (!stop && (FOREVER || Date.now() - started < RUN_DURATION_MS)) {
    const t0 = Date.now();
    const [funding, basis, lend] = await Promise.allSettled([
      runFundingCycle(),
      runBasisCycle(),
      runLendCycle(),
    ]);
    if (funding.status === "fulfilled") {
      console.log(`funding: ticks=${funding.value.ticks} opps=${funding.value.opps}`);
    } else console.error("funding cycle failed:", funding.reason);
    if (basis.status === "fulfilled") {
      console.log(`basis:   ticks=${basis.value.ticks} opps=${basis.value.opps}`);
    } else console.error("basis cycle failed:", basis.reason);
    if (lend.status === "fulfilled") {
      console.log(`lend:    rates=${lend.value.rates} opps=${lend.value.opps}`);
    } else console.error("lend cycle failed:", lend.reason);

    // Loop + Pendle engines depend on freshly-written lend_rates from this cycle
    try {
      const r = await runLoopCycle();
      console.log(`loop:    pairs=${r.pairs} opps=${r.opps}`);
    } catch (err) {
      console.error("loop cycle failed:", err);
    }
    try {
      const r = await runPendleCycle();
      console.log(`pendle:  markets=${r.markets} opps=${r.opps}`);
    } catch (err) {
      console.error("pendle cycle failed:", err);
    }
    try {
      const r = await runPegCycle();
      console.log(`peg:     apr=${(r.aprBps / 100).toFixed(2)}% wait=${r.waitDays.toFixed(2)}d best=${r.bestSteth.toFixed(6)}`);
    } catch (err) {
      console.error("peg cycle failed:", err);
    }
    try {
      const r = await runRollupCycle();
      console.log(`rollup:  rows=${r.rows}`);
    } catch (err) {
      console.error("rollup cycle failed:", err);
    }

    const elapsed = Date.now() - t0;
    const wait = Math.max(0, TICK_INTERVAL_MS - elapsed);
    if (FOREVER || Date.now() - started + wait < RUN_DURATION_MS) {
      await new Promise((r) => setTimeout(r, wait));
    } else break;
  }
}

await loop();
await pgPool.end();
console.log("worker stopped");
