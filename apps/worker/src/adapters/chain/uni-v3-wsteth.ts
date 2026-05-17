import { Chain, MAINNET_CONTRACT_ADDRESSES } from "shared";
import { getChainClient } from "../../chain/clients.js";

const POOL_ABI = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

const WSTETH_ABI = [
  {
    type: "function",
    name: "stEthPerToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface UniV3WstethPrice {
  pool: "0.01%" | "0.05%";
  poolAddr: string;
  /** WETH per 1 wstETH (decimal). */
  wethPerWsteth: number;
  /** ETH per 1 stETH (decimal), derived via stEthPerToken. */
  ethPerSteth: number;
  ts: Date;
}

const TWO_POW_192 = 2n ** 192n;
const SCALE_18 = 10n ** 18n;

function sqrtPriceX96ToPrice(sqrt: bigint): number {
  // price = (sqrt / 2^96)^2 = sqrt^2 / 2^192. Token0=wstETH, Token1=WETH → price = WETH per wstETH.
  // Convert via bigint scaling for precision.
  const numerator = sqrt * sqrt * SCALE_18;
  return Number(numerator / TWO_POW_192) / Number(SCALE_18);
}

async function pricePool(poolAddr: `0x${string}`, label: "0.01%" | "0.05%", stEthPerToken: bigint): Promise<UniV3WstethPrice> {
  const client = getChainClient(Chain.Mainnet);
  const slot0 = (await client.readContract({
    address: poolAddr,
    abi: POOL_ABI,
    functionName: "slot0",
  })) as readonly [bigint, number, number, number, number, number, boolean];

  const wethPerWsteth = sqrtPriceX96ToPrice(slot0[0]);
  // stEth/Eth = wethPerWsteth / (stEthPerToken/1e18)  →  the ratio collapses since 1 wstETH = (stEthPerToken/1e18) stETH
  const ethPerSteth = wethPerWsteth / (Number(stEthPerToken) / Number(SCALE_18));

  return {
    pool: label,
    poolAddr,
    wethPerWsteth,
    ethPerSteth,
    ts: new Date(),
  };
}

export async function fetchUniV3WstethPrices(): Promise<UniV3WstethPrice[]> {
  const client = getChainClient(Chain.Mainnet);
  const stEthPerToken = (await client.readContract({
    address: MAINNET_CONTRACT_ADDRESSES.lidoWsteth as `0x${string}`,
    abi: WSTETH_ABI,
    functionName: "stEthPerToken",
  })) as bigint;

  const results = await Promise.allSettled([
    pricePool(MAINNET_CONTRACT_ADDRESSES.uniswapV3WstethWeth001Pool as `0x${string}`, "0.01%", stEthPerToken),
    pricePool(MAINNET_CONTRACT_ADDRESSES.uniswapV3WstethWeth005Pool as `0x${string}`, "0.05%", stEthPerToken),
  ]);
  const out: UniV3WstethPrice[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(r.value);
    else console.warn("uni v3 pool failed:", r.reason);
  }
  return out;
}
