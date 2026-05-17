import {
  AAVE_V3_POOL_ADDRESSES,
  ASSET_ADDRESSES,
  Chain,
  Venue,
  type LendRate,
} from "shared";
import { getChainClient } from "../../chain/clients.js";

const RAY = 10n ** 27n;
const BPS_PER_LTV_FIELD = 16n; // LTV occupies bits 0-15; LT bits 16-31

const POOL_ABI = [
  {
    type: "function",
    name: "getReserveData",
    stateMutability: "view",
    inputs: [{ name: "asset", type: "address" }],
    outputs: [
      {
        components: [
          { name: "configuration", type: "tuple", components: [{ name: "data", type: "uint256" }] },
          { name: "liquidityIndex", type: "uint128" },
          { name: "currentLiquidityRate", type: "uint128" },
          { name: "variableBorrowIndex", type: "uint128" },
          { name: "currentVariableBorrowRate", type: "uint128" },
          { name: "currentStableBorrowRate", type: "uint128" },
          { name: "lastUpdateTimestamp", type: "uint40" },
          { name: "id", type: "uint16" },
          { name: "aTokenAddress", type: "address" },
          { name: "stableDebtTokenAddress", type: "address" },
          { name: "variableDebtTokenAddress", type: "address" },
          { name: "interestRateStrategyAddress", type: "address" },
          { name: "accruedToTreasury", type: "uint128" },
          { name: "unbacked", type: "uint128" },
          { name: "isolationModeTotalDebt", type: "uint128" },
        ],
        name: "",
        type: "tuple",
      },
    ],
  },
] as const;

const ASSETS = ["WETH", "wstETH"] as const;

interface ReserveData {
  configuration: { data: bigint };
  currentLiquidityRate: bigint;
  currentVariableBorrowRate: bigint;
}

const rayToDecimal = (ray: bigint): number => Number(ray) / Number(RAY);

const extractLtvBps = (configData: bigint): number => {
  // bits 0-15
  const mask = (1n << BPS_PER_LTV_FIELD) - 1n;
  return Number(configData & mask);
};

const extractLltBps = (configData: bigint): number => {
  // bits 16-31
  const mask = (1n << BPS_PER_LTV_FIELD) - 1n;
  return Number((configData >> BPS_PER_LTV_FIELD) & mask);
};

async function fetchChain(chain: Chain): Promise<LendRate[]> {
  const client = getChainClient(chain);
  const pool = AAVE_V3_POOL_ADDRESSES[chain] as `0x${string}`;
  const ts = new Date();

  const calls = ASSETS.map((asset) => ({
    address: pool,
    abi: POOL_ABI,
    functionName: "getReserveData" as const,
    args: [ASSET_ADDRESSES[asset][chain] as `0x${string}`],
  }));

  const results = await client.multicall({
    contracts: calls,
    allowFailure: true,
  });

  const out: LendRate[] = [];
  for (let i = 0; i < ASSETS.length; i++) {
    const r = results[i];
    if (r.status !== "success") continue;
    const data = r.result as unknown as ReserveData;
    out.push({
      chain,
      venue: Venue.AaveV3,
      asset: ASSETS[i],
      supplyAprBps: Math.round(rayToDecimal(data.currentLiquidityRate) * 10_000),
      borrowAprBps: Math.round(rayToDecimal(data.currentVariableBorrowRate) * 10_000),
      ltvBps: extractLtvBps(data.configuration.data),
      lltBps: extractLltBps(data.configuration.data),
      emode: false,
      borrowable: true,
      totalSupplyUsd: null,
      totalBorrowUsd: null,
      ts,
    });
  }
  return out;
}

export async function fetchAaveV3WethWsteth(): Promise<LendRate[]> {
  const chains: Chain[] = [Chain.Mainnet, Chain.Arbitrum, Chain.Optimism, Chain.Base];
  const results = await Promise.allSettled(chains.map(fetchChain));
  const out: LendRate[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") out.push(...r.value);
    else console.warn("aave chain failed:", r.reason);
  }
  return out;
}
