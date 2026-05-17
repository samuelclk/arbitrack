import { NextResponse } from "next/server";
import { pgPool } from "../../../../lib/db";

export const dynamic = "force-dynamic";

// Returns last 24 hourly spread points for a (category, pair).
export async function GET(
  _req: Request,
  { params }: { params: { category: string; pair: string } },
) {
  const { category, pair } = params;
  const { rows } = await pgPool.query<{ hour: string; spread_bps_avg: string }>(
    `SELECT hour, spread_bps_avg
       FROM spread_hourly
      WHERE category = $1 AND pair = $2
      ORDER BY hour DESC
      LIMIT 24`,
    [category, decodeURIComponent(pair)],
  );
  return NextResponse.json(rows.reverse());
}
