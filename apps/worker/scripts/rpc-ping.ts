import "dotenv/config";
import { Chain } from "shared";
import { multicall3Healthcheck } from "../src/chain/clients.js";

for (const chain of Object.values(Chain)) {
  try {
    const block = await multicall3Healthcheck(chain);
    console.log(`${chain}: latest block = ${block}`);
  } catch (err) {
    console.log(`${chain}: ERROR ${(err as Error).message}`);
  }
}
