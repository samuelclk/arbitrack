import { Pool } from "pg";

const globalForPool = globalThis as unknown as { __pgPool?: Pool };

export const pgPool: Pool =
  globalForPool.__pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
  });

if (process.env.NODE_ENV !== "production") globalForPool.__pgPool = pgPool;
