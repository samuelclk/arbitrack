import {
  ASSET_ADDRESSES,
  Chain,
  MAINNET_CONTRACT_ADDRESSES,
  Venue,
  type LendRate,
} from "shared";
import { getChainClient } from "../../chain/clients.js";

const RAY = 10n ** 27n;
const LTV_FIELD_WIDTH = 16n;

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
const fieldMask = (1n << LTV_FIELD_WIDTH) - 1n;

export async function fetchSparkWethWsteth(): Promise<LendRate[]> {
  const client = getChainClient(Chain.Mainnet);
  const pool = MAINNET_CONTRACT_ADDRESSES.sparkPool as `0x${string}`;
  const ts = new Date();

  const results = await client.multicall({
    contracts: ASSETS.map((asset) => ({
      address: pool,
      abi: POOL_ABI,
      functionName: "getReserveData" as const,
      args: [ASSET_ADDRESSES[asset][Chain.Mainnet] as `0x${string}`],
    })),
    allowFailure: true,
  });

  const out: LendRate[] = [];
  for (let i = 0; i < ASSETS.length; i++) {
    const r = results[i];
    if (r.status !== "success") continue;
    const d = r.result as unknown as ReserveData;
    out.push({
      chain: Chain.Mainnet,
      venue: Venue.Spark,
      asset: ASSETS[i],
      supplyAprBps: Math.round(rayToDecimal(d.currentLiquidityRate) * 10_000),
      borrowAprBps: Math.round(rayToDecimal(d.currentVariableBorrowRate) * 10_000),
      ltvBps: Number(d.configuration.data & fieldMask),
      lltBps: Number((d.configuration.data >> LTV_FIELD_WIDTH) & fieldMask),
      emode: false,
      borrowable: true,
      totalSupplyUsd: null,
      totalBorrowUsd: null,
      ts,
    });
  }
  return out;
}
