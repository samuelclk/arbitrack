import { pgPool } from "./db";

export async function loadSparklinePoints(
  category: string,
  pair: string,
  limit = 24,
): Promise<number[]> {
  const { rows } = await pgPool.query<{ spread_bps_avg: string }>(
    `SELECT spread_bps_avg
       FROM spread_hourly
      WHERE category = $1 AND pair = $2
      ORDER BY hour DESC
      LIMIT $3`,
    [category, pair, limit],
  );
  return rows.reverse().map((r) => Number(r.spread_bps_avg));
}
