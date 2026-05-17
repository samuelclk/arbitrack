import { z } from "zod";
import {
  Chain,
  MAINNET_CONTRACT_ADDRESSES,
  Venue,
} from "shared";
import { getChainClient } from "../../chain/clients.js";

const SMA_URL = "https://eth-api.lido.fi/v1/protocol/steth/apr/sma";

const smaResponse = z.object({
  data: z.object({
    smaApr: z.number(),
    aprs: z.array(z.object({ timeUnix: z.number(), apr: z.number() })),
  }),
});

const LIDO_ABI = [
  {
    type: "function",
    name: "getPooledEthByShares",
    stateMutability: "view",
    inputs: [{ name: "_sharesAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface StethApr {
  apr: number; // decimal (e.g. 0.0245)
  source: "lido-api-sma" | "on-chain-share-rate";
  ts: Date;
}

async function fetchSmaApr(): Promise<StethApr | null> {
  try {
    const res = await fetch(SMA_URL);
    if (!res.ok) return null;
    const parsed = smaResponse.parse(await res.json());
    return {
      apr: parsed.data.smaApr / 100, // API returns percent (e.g. 2.45 → 0.0245)
      source: "lido-api-sma",
      ts: new Date(),
    };
  } catch {
    return null;
  }
}

async function fetchOnChainApr(): Promise<StethApr> {
  const client = getChainClient(Chain.Mainnet);
  const lido = MAINNET_CONTRACT_ADDRESSES.lidoSteth as `0x${string}`;
  const ONE_ETHER = 10n ** 18n;

  const latestBlock = await client.getBlockNumber();
  // ~24h ago at 12s/block: 7200 blocks
  const yesterdayBlock = latestBlock - 7200n;

  const [latestRate, yesterdayRate] = await Promise.all([
    client.readContract({
      address: lido,
      abi: LIDO_ABI,
      functionName: "getPooledEthByShares",
      args: [ONE_ETHER],
      blockNumber: latestBlock,
    }),
    client.readContract({
      address: lido,
      abi: LIDO_ABI,
      functionName: "getPooledEthByShares",
      args: [ONE_ETHER],
      blockNumber: yesterdayBlock,
    }),
  ]);

  const ratio = Number(latestRate) / Number(yesterdayRate);
  const apr = (ratio - 1) * 365; // ~24h delta → annualize
  return { apr, source: "on-chain-share-rate", ts: new Date() };
}

export async function fetchStethApr(): Promise<StethApr> {
  const fromApi = await fetchSmaApr();
  if (fromApi) return fromApi;
  return fetchOnChainApr();
}

// Re-export Venue so the engine layer can reference it from this module if needed
export { Venue };
