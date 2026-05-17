import {
  ASSET_ADDRESSES,
  Chain,
  MAINNET_CONTRACT_ADDRESSES,
} from "shared";
import { getChainClient } from "../../chain/clients.js";

const VAULT_ADDR = "0xBA12222222228d8Ba445958a75a0704d566BF2C8" as const;
const POOL_ID =
  "0x32296969ef14eb0c6d29669c550d4a0449130230000200000000000000000080" as const;

const VAULT_ABI = [
  {
    type: "function",
    name: "queryBatchSwap",
    stateMutability: "view", // declared nonpayable on chain, but the call works on view-only RPC
    inputs: [
      { name: "kind", type: "uint8" },
      {
        name: "swaps",
        type: "tuple[]",
        components: [
          { name: "poolId", type: "bytes32" },
          { name: "assetInIndex", type: "uint256" },
          { name: "assetOutIndex", type: "uint256" },
          { name: "amount", type: "uint256" },
          { name: "userData", type: "bytes" },
        ],
      },
      { name: "assets", type: "address[]" },
      {
        name: "funds",
        type: "tuple",
        components: [
          { name: "sender", type: "address" },
          { name: "fromInternalBalance", type: "bool" },
          { name: "recipient", type: "address" },
          { name: "toInternalBalance", type: "bool" },
        ],
      },
    ],
    outputs: [{ name: "", type: "int256[]" }],
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

const ONE_ETHER = 10n ** 18n;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as const;

export interface BalancerWstethPrice {
  poolId: string;
  /** WETH per 1 wstETH (decimal). */
  wethPerWsteth: number;
  /** ETH per 1 stETH (decimal), derived via stEthPerToken. */
  ethPerSteth: number;
  ts: Date;
}

export async function fetchBalancerWstethPrice(): Promise<BalancerWstethPrice> {
  const client = getChainClient(Chain.Mainnet);
  const wsteth = ASSET_ADDRESSES.wstETH[Chain.Mainnet] as `0x${string}`;
  const weth = ASSET_ADDRESSES.WETH[Chain.Mainnet] as `0x${string}`;

  const assets = [wsteth, weth] as const;
  // Funds: dummy (the call is a query, no actual transfer)
  const funds = {
    sender: ZERO_ADDR,
    fromInternalBalance: false,
    recipient: ZERO_ADDR,
    toInternalBalance: false,
  } as const;
  const swaps = [
    {
      poolId: POOL_ID,
      assetInIndex: 0n,
      assetOutIndex: 1n,
      amount: ONE_ETHER,
      userData: "0x" as `0x${string}`,
    },
  ];

  // queryBatchSwap signed as nonpayable in some ABIs; simulate via eth_call by using simulateContract.
  const result = (await client.simulateContract({
    address: VAULT_ADDR,
    abi: VAULT_ABI,
    functionName: "queryBatchSwap",
    args: [0, swaps, assets, funds],
  })) as unknown as { result: bigint[] };

  // deltas: [+1e18 wstETH in, -amount WETH out] (signed)
  const wethOutWei = -result.result[1];
  const wethPerWsteth = Number(wethOutWei) / Number(ONE_ETHER);

  const stEthPerToken = (await client.readContract({
    address: MAINNET_CONTRACT_ADDRESSES.lidoWsteth as `0x${string}`,
    abi: WSTETH_ABI,
    functionName: "stEthPerToken",
  })) as bigint;

  const ethPerSteth = wethPerWsteth / (Number(stEthPerToken) / Number(ONE_ETHER));

  return {
    poolId: POOL_ID,
    wethPerWsteth,
    ethPerSteth,
    ts: new Date(),
  };
}
