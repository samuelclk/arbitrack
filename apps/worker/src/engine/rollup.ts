import { pgPool } from "../db/client.js";

/**
 * Incremental rollup: for the current and previous hour, recompute
 * spread_hourly from opportunities. Idempotent — safe to run on a cron.
 * Cron cadence: every 5 minutes per SPEC.
 */
export async function runRollupCycle(): Promise<{ rows: number }> {
  const sql = `
    INSERT INTO spread_hourly (category, pair, venue_key, hour, spread_bps_avg, spread_bps_max)
    SELECT
      category,
      pair,
      COALESCE(long_venue, '-') || '|' || COALESCE(short_venue, '-') AS venue_key,
      date_trunc('hour', computed_at) AS hour,
      AVG(spread_bps) AS spread_bps_avg,
      MAX(spread_bps) AS spread_bps_max
    FROM opportunities
    WHERE computed_at >= date_trunc('hour', NOW()) - INTERVAL '1 hour'
      AND spread_bps IS NOT NULL
    GROUP BY category, pair, venue_key, hour
    ON CONFLICT (category, pair, venue_key, hour)
    DO UPDATE SET
      spread_bps_avg = EXCLUDED.spread_bps_avg,
      spread_bps_max = EXCLUDED.spread_bps_max
    RETURNING 1;
  `;
  const res = await pgPool.query(sql);
  return { rows: res.rowCount ?? 0 };
}
