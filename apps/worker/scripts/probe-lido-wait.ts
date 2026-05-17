import { fetchLidoWaitTime } from "../src/adapters/lido/wait-time.ts";

for (const amount of [1, 1000]) {
  const w = await fetchLidoWaitTime(amount);
  console.log(
    `${amount} ETH: wait=${w.waitDays.toFixed(3)} days ` +
      `(with margin ${w.waitDaysWithMargin.toFixed(3)}), ` +
      `type=${w.type}, finalizationAt=${w.finalizationAt.toISOString()}`,
  );
}
