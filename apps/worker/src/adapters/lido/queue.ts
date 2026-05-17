import { Chain, MAINNET_CONTRACT_ADDRESSES } from "shared";
import { getChainClient } from "../../chain/clients.js";

const ABI = [
  {
    type: "function",
    name: "unfinalizedStETH",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getLastRequestId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getLastFinalizedRequestId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "isBunkerModeActive",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export interface LidoQueueSnap {
  unfinalizedStethWei: bigint;
  unfinalizedSteth: number; // ether
  lastRequestId: bigint;
  lastFinalizedRequestId: bigint;
  bunkerMode: boolean;
  ts: Date;
}

export async function fetchLidoQueue(): Promise<LidoQueueSnap> {
  const client = getChainClient(Chain.Mainnet);
  const address = MAINNET_CONTRACT_ADDRESSES.lidoWithdrawalQueue as `0x${string}`;

  const results = await client.multicall({
    contracts: [
      { address, abi: ABI, functionName: "unfinalizedStETH" },
      { address, abi: ABI, functionName: "getLastRequestId" },
      { address, abi: ABI, functionName: "getLastFinalizedRequestId" },
      { address, abi: ABI, functionName: "isBunkerModeActive" },
    ],
    allowFailure: true,
  });

  const [u, last, lastFin, bunker] = results;
  if (u.status !== "success" || last.status !== "success" || lastFin.status !== "success") {
    throw new Error("Lido queue read failed");
  }

  const wei = u.result as bigint;
  return {
    unfinalizedStethWei: wei,
    unfinalizedSteth: Number(wei) / 1e18,
    lastRequestId: last.result as bigint,
    lastFinalizedRequestId: lastFin.result as bigint,
    bunkerMode: bunker.status === "success" ? (bunker.result as boolean) : false,
    ts: new Date(),
  };
}
