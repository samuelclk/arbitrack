import { NextResponse } from "next/server";
import { pgPool } from "../../lib/db";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5_000;
const cache = new Map<string, { ts: number; rows: unknown[] }>();

interface OpportunityRow {
  id: string;
  category: string;
  pair: string;
  long_venue: string | null;
  short_venue: string | null;
  chain: string | null;
  spread_bps: string | null;
  apr_bps: string;
  detail: unknown;
  computed_at: string;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const cat = searchParams.get("cat") ?? "all";
  const cacheKey = cat;

  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) {
    return NextResponse.json(hit.rows);
  }

  const sql =
    cat === "all"
      ? `SELECT id, category, pair, long_venue, short_venue, chain,
                spread_bps, apr_bps, detail, computed_at
         FROM opportunities
         ORDER BY apr_bps DESC NULLS LAST
         LIMIT 500`
      : `SELECT id, category, pair, long_venue, short_venue, chain,
                spread_bps, apr_bps, detail, computed_at
         FROM opportunities
         WHERE category = $1
         ORDER BY apr_bps DESC NULLS LAST
         LIMIT 500`;
  const params = cat === "all" ? [] : [cat];
  const { rows } = await pgPool.query<OpportunityRow>(sql, params);

  cache.set(cacheKey, { ts: Date.now(), rows });
  return NextResponse.json(rows);
}
