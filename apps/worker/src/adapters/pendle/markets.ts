import { z } from "zod";
import { ASSET_ADDRESSES, CHAIN_IDS, Chain, type PendleMarket } from "shared";

const DEFAULT_API_BASE = "https://api-v2.pendle.finance/core";

const marketSchema = z.object({
  name: z.string(),
  address: z.string(),
  expiry: z.string(),
  underlyingAsset: z.string(),
  details: z
    .object({
      liquidity: z.number().nullable().optional(),
      impliedApy: z.number().nullable().optional(),
      pendleApy: z.number().nullable().optional(),
    })
    .optional(),
});

const responseSchema = z.object({
  markets: z.array(marketSchema),
});

const WSTETH_ADDRESSES_LC = new Set(
  Object.values(ASSET_ADDRESSES.wstETH).map((a) => a.toLowerCase()),
);

const aprDecimalToBps = (v: number | null | undefined): number =>
  v == null ? 0 : Math.round(v * 10000);

/** Extracts the bare 0x… address from Pendle's "<chainId>-0x…" format. */
const stripChainPrefix = (s: string): string => {
  const m = s.match(/^\d+-(0x[0-9a-fA-F]+)$/);
  return (m ? m[1] : s).toLowerCase();
};

const SUPPORTED_CHAINS: Chain[] = [Chain.Mainnet, Chain.Arbitrum, Chain.Base];

export async function fetchPendleWstethMarkets(): Promise<PendleMarket[]> {
  const apiBase = process.env.PENDLE_API_BASE ?? DEFAULT_API_BASE;
  const ts = new Date();
  const out: PendleMarket[] = [];

  for (const chain of SUPPORTED_CHAINS) {
    const chainId = CHAIN_IDS[chain];
    const url = `${apiBase}/v1/${chainId}/markets/active`;
    const res = await fetch(url);
    if (!res.ok) continue;
    const parsed = responseSchema.parse(await res.json());

    for (const m of parsed.markets) {
      const underlyingAddr = stripChainPrefix(m.underlyingAsset);
      const isWsteth =
        m.name.toLowerCase() === "wsteth" || WSTETH_ADDRESSES_LC.has(underlyingAddr);
      if (!isWsteth) continue;

      out.push({
        chain,
        marketAddr: m.address.toLowerCase(),
        underlying: "wstETH",
        expiry: new Date(m.expiry),
        ptImpliedApyBps: aprDecimalToBps(m.details?.impliedApy),
        ytFloatingApyBps:
          m.details?.pendleApy == null ? null : aprDecimalToBps(m.details.pendleApy),
        liquidityUsd: m.details?.liquidity ?? null,
        ts,
      });
    }
  }

  return out;
}
