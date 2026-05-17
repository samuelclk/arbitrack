import { createPublicClient, http, type PublicClient } from "viem";
import { mainnet, arbitrum, optimism, base } from "viem/chains";
import { Chain, alchemyRpcUrl } from "shared";

const VIEM_CHAINS = {
  [Chain.Mainnet]: mainnet,
  [Chain.Arbitrum]: arbitrum,
  [Chain.Optimism]: optimism,
  [Chain.Base]: base,
} as const;

const clients = new Map<Chain, PublicClient>();

export function getChainClient(chain: Chain): PublicClient {
  const cached = clients.get(chain);
  if (cached) return cached;

  const alchemyKey = process.env.ALCHEMY_KEY;
  if (!alchemyKey) throw new Error("ALCHEMY_KEY is not set");

  const client = createPublicClient({
    chain: VIEM_CHAINS[chain],
    transport: http(alchemyRpcUrl(chain, alchemyKey), { batch: true }),
  });
  clients.set(chain, client);
  return client;
}

export async function multicall3Healthcheck(chain: Chain): Promise<bigint> {
  return getChainClient(chain).getBlockNumber();
}
