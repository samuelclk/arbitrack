import { z } from "zod";
import { ASSET_ADDRESSES, CHAIN_IDS, Chain, Venue, type LendRate } from "shared";

const MORPHO_GRAPHQL = "https://blue-api.morpho.org/graphql";

const QUERY = `
  query WstethMarkets($collateralAddresses: [String!]!, $chainIds: [Int!]!) {
    markets(
      where: {
        chainId_in: $chainIds
        collateralAssetAddress_in: $collateralAddresses
      }
      first: 50
      orderBy: SupplyAssetsUsd
      orderDirection: Desc
    ) {
      items {
        uniqueKey
        lltv
        collateralAsset { symbol address }
        loanAsset { symbol address }
        chain { id }
        state { borrowApy supplyAssetsUsd borrowAssetsUsd }
      }
    }
  }
`;

const responseSchema = z.object({
  data: z.object({
    markets: z.object({
      items: z.array(
        z.object({
          uniqueKey: z.string(),
          lltv: z.string(),
          collateralAsset: z.object({ symbol: z.string(), address: z.string() }),
          loanAsset: z.object({ symbol: z.string(), address: z.string() }),
          chain: z.object({ id: z.number() }),
          state: z
            .object({
              borrowApy: z.number().nullable(),
              supplyAssetsUsd: z.number().nullable(),
              borrowAssetsUsd: z.number().nullable(),
            })
            .nullable(),
        }),
      ),
    }),
  }),
});

const CHAIN_ID_TO_ENUM: Record<number, Chain> = {
  [CHAIN_IDS[Chain.Mainnet]]: Chain.Mainnet,
  [CHAIN_IDS[Chain.Arbitrum]]: Chain.Arbitrum,
  [CHAIN_IDS[Chain.Optimism]]: Chain.Optimism,
  [CHAIN_IDS[Chain.Base]]: Chain.Base,
};

export interface MorphoMarket {
  marketId: string;
  chain: Chain;
  collateralSymbol: string;
  loanSymbol: string;
  lltvBps: number;
  borrowAprBps: number | null;
  supplyAssetsUsd: number | null;
  borrowAssetsUsd: number | null;
}

const ratioWeiToBps = (lltvWei: string): number =>
  Math.round((Number(BigInt(lltvWei)) / 1e18) * 10000);

const aprDecimalToBps = (apy: number | null): number | null =>
  apy == null ? null : Math.round(apy * 10000);

export async function fetchMorphoWstethMarkets(): Promise<MorphoMarket[]> {
  const collateralAddresses = [
    ASSET_ADDRESSES.wstETH[Chain.Mainnet],
    ASSET_ADDRESSES.wstETH[Chain.Arbitrum],
    ASSET_ADDRESSES.wstETH[Chain.Base],
  ];
  const chainIds = [
    CHAIN_IDS[Chain.Mainnet],
    CHAIN_IDS[Chain.Arbitrum],
    CHAIN_IDS[Chain.Base],
  ];

  const res = await fetch(MORPHO_GRAPHQL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables: { collateralAddresses, chainIds },
    }),
  });
  const json = await res.json();
  const parsed = responseSchema.parse(json);

  return parsed.data.markets.items.flatMap((m): MorphoMarket[] => {
    const chain = CHAIN_ID_TO_ENUM[m.chain.id];
    if (!chain) return [];
    return [
      {
        marketId: m.uniqueKey,
        chain,
        collateralSymbol: m.collateralAsset.symbol,
        loanSymbol: m.loanAsset.symbol,
        lltvBps: ratioWeiToBps(m.lltv),
        borrowAprBps: aprDecimalToBps(m.state?.borrowApy ?? null),
        supplyAssetsUsd: m.state?.supplyAssetsUsd ?? null,
        borrowAssetsUsd: m.state?.borrowAssetsUsd ?? null,
      },
    ];
  });
}

export function morphoMarketsToLendRates(markets: MorphoMarket[]): LendRate[] {
  const ts = new Date();
  return markets.map((m) => ({
    chain: m.chain,
    venue: Venue.MorphoBlue,
    asset: m.collateralSymbol,
    supplyAprBps: null,
    borrowAprBps: m.borrowAprBps,
    ltvBps: m.lltvBps,
    lltBps: m.lltvBps,
    emode: false,
    borrowable: false,
    totalSupplyUsd: m.supplyAssetsUsd,
    totalBorrowUsd: m.borrowAssetsUsd,
    ts,
  }));
}
