import { pgPool } from "./db";

export interface PegRow {
  apr_bps: string;
  spread_bps: string;
  computed_at: string;
  detail: {
    bestStethPrice: number;
    waitDays: number;
    waitType: string;
    unfinalizedStethEth: number;
    bunkerMode: boolean;
    dexPriceCount: number;
  };
}

export async function loadLatestPeg(): Promise<PegRow | null> {
  const { rows } = await pgPool.query<PegRow>(
    `SELECT apr_bps, spread_bps, computed_at, detail
       FROM opportunities
      WHERE category = 'peg'
   ORDER BY computed_at DESC
      LIMIT 1`,
  );
  return rows[0] ?? null;
}
