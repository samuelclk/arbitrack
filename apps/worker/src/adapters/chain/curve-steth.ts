import { Chain, MAINNET_CONTRACT_ADDRESSES } from "shared";
import { getChainClient } from "../../chain/clients.js";

const POOL_ABI = [
  {
    type: "function",
    name: "get_dy",
    stateMutability: "view",
    inputs: [
      { name: "i", type: "int128" },
      { name: "j", type: "int128" },
      { name: "dx", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const ONE_ETHER = 10n ** 18n;

export interface CurveStethPrice {
  pool: "old" | "ng";
  poolAddr: string;
  /** ETH out per 1 stETH in (decimal, ~1.0). */
  stethToEthPrice: number;
  ts: Date;
}

async function priceOnPool(poolAddr: `0x${string}`, label: "old" | "ng"): Promise<CurveStethPrice> {
  const client = getChainClient(Chain.Mainnet);
  // stETH index = 1, ETH index = 0 → get_dy(1, 0, 1e18) gives ETH out for 1 stETH
  const ethOut = (await client.readContract({
    address: poolAddr,
    abi: POOL_ABI,
    functionName: "get_dy",
    args: [1n, 0n, ONE_ETHER],
  })) as bigint;

  return {
    pool: label,
    poolAddr,
    stethToEthPrice: Number(ethOut) / Number(ONE_ETHER),
    ts: new Date(),
  };
}

export async function fetchCurveStethPrices(): Promise<CurveStethPrice[]> {
  const results = await Promise.allSettled([
    priceOnPool(MAINNET_CONTRACT_ADDRESSES.curveStethEthPool as `0x${string}`, "old"),
    priceOnPool(MAINNET_CONTRACT_ADDRESSES.curveStethNgPool as `0x${string}`, "ng"),
  ]);
  const out: CurveStethPrice[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(r.value);
    else console.warn("curve pool read failed:", r.reason);
  }
  return out;
}
