import "../src/env.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pgPool } from "../src/db/client.js";

const MIGRATIONS_DIR = "db/migrations";

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error(`no .sql files in ${MIGRATIONS_DIR}`);
  process.exit(1);
}

for (const file of files) {
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
  console.log(`applying ${file}…`);
  await pgPool.query(sql);
}

await pgPool.end();
console.log("migrations done");
