import { config } from "dotenv";
import { existsSync } from "node:fs";

for (const p of [".env.local", "../../.env.local", "../../../.env.local"]) {
  if (existsSync(p)) config({ path: p });
}
