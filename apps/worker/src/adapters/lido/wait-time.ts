import { z } from "zod";

const WQ_API_BASE = "https://wq-api.lido.fi/v2/request-time/calculate";
const MAX_AMOUNT = 1_000_000_000_000;

const responseSchema = z.object({
  requestInfo: z.object({
    finalizationIn: z.number(),
    finalizationAt: z.string(),
    type: z.string(),
  }),
  status: z.string().optional(),
  nextCalculationAt: z.string().optional(),
});

export interface LidoWaitTime {
  amountEth: number;
  finalizationAt: Date;
  finalizationInMs: number;
  waitDays: number;
  /** API tends to be ~24h optimistic for >2 day waits. Caller may add margin. */
  waitDaysWithMargin: number;
  type: string;
}

/** amountEth is WHOLE ETHER (not wei). API caps at 1e12. */
export async function fetchLidoWaitTime(amountEth: number): Promise<LidoWaitTime> {
  if (!Number.isFinite(amountEth) || amountEth <= 0) {
    throw new Error(`amountEth must be positive, got ${amountEth}`);
  }
  if (amountEth > MAX_AMOUNT) {
    throw new Error(`amountEth ${amountEth} exceeds API cap ${MAX_AMOUNT}`);
  }

  const url = `${WQ_API_BASE}?amount=${amountEth}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Lido wq-api ${res.status}: ${await res.text()}`);
  const parsed = responseSchema.parse(await res.json());

  const finalizationAt = new Date(parsed.requestInfo.finalizationAt);
  const finalizationInMs = parsed.requestInfo.finalizationIn;
  const waitDays = finalizationInMs / 86_400_000;
  const waitDaysWithMargin = waitDays > 2 ? waitDays + 1 : waitDays;

  return {
    amountEth,
    finalizationAt,
    finalizationInMs,
    waitDays,
    waitDaysWithMargin,
    type: parsed.requestInfo.type,
  };
}
