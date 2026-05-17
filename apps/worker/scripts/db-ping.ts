import "../src/env.js";
import { pgPool } from "../src/db/client.js";

const res = await pgPool.query("SELECT 1");
if (res.rows.length === 1) {
  console.log("ok");
}
await pgPool.end();
