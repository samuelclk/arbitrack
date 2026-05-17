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

const RPC_URL_ENV_BY_CHAIN: Record<Chain, string> = {
  [Chain.Mainnet]: "RPC_URL_MAINNET",
  [Chain.Arbitrum]: "RPC_URL_ARBITRUM",
  [Chain.Optimism]: "RPC_URL_OPTIMISM",
  [Chain.Base]: "RPC_URL_BASE",
};

function resolveRpcUrl(chain: Chain): string {
  const override = process.env[RPC_URL_ENV_BY_CHAIN[chain]];
  if (override) return override;
  const alchemyKey = process.env.ALCHEMY_KEY;
  if (!alchemyKey) throw new Error(`Neither ${RPC_URL_ENV_BY_CHAIN[chain]} nor ALCHEMY_KEY is set`);
  return alchemyRpcUrl(chain, alchemyKey);
}

export function getChainClient(chain: Chain): PublicClient {
  const cached = clients.get(chain);
  if (cached) return cached;

  const client = createPublicClient({
    chain: VIEM_CHAINS[chain],
    transport: http(resolveRpcUrl(chain), { batch: true }),
  });
  clients.set(chain, client);
  return client;
}

export async function multicall3Healthcheck(chain: Chain): Promise<bigint> {
  return getChainClient(chain).getBlockNumber();
}
