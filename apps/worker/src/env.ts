import { config } from "dotenv";
import { existsSync } from "node:fs";
import { setDefaultResultOrder } from "node:dns";

// Neon Postgres host names resolve to IPv6 addresses that often time out from
// IPv4-only egress paths; force IPv4-first so connections succeed reliably.
setDefaultResultOrder("ipv4first");

for (const p of [".env.local", "../../.env.local", "../../../.env.local"]) {
  if (existsSync(p)) config({ path: p });
}
