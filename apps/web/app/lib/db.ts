import { Pool, type QueryResult, type QueryResultRow } from "pg";
import { setDefaultResultOrder } from "node:dns";

// Neon Postgres hostnames resolve to IPv6 addresses that often time out from
// IPv4-only egress paths. Force IPv4-first before any connection attempts.
setDefaultResultOrder("ipv4first");

const globalForPool = globalThis as unknown as { __pgPool?: Pool };

const rawPool: Pool =
  globalForPool.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,
    connectionTimeoutMillis: 5_000,
    keepAlive: true,
    idleTimeoutMillis: 30_000,
  });

if (process.env.NODE_ENV !== "production") globalForPool.__pgPool = rawPool;

// Neon's pooler hostname rotates across several IPs; ~half of them refuse
// connections from this egress and time out. Retry transparently up to 4×.
async function queryWithRetry<R extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<QueryResult<R>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      return await rawPool.query<R>(text, params as never[]);
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string }).code;
      if (code !== "ETIMEDOUT" && code !== "EHOSTUNREACH" && code !== "ECONNREFUSED") throw err;
    }
  }
  throw lastErr;
}

export const pgPool = {
  query: queryWithRetry,
} as const;
