import { z } from "zod";
import { Chain, Venue, type LendRate } from "shared";

const POOLS_URL = "https://yields.llama.fi/pools";
const LEND_BORROW_URL = "https://yields.llama.fi/lendBorrow";

const PROJECTS = ["aave-v3", "morpho-blue", "spark", "compound-v3"] as const;
type Project = (typeof PROJECTS)[number];

const PROJECT_TO_VENUE: Record<Project, Venue> = {
  "aave-v3": Venue.AaveV3,
  "morpho-blue": Venue.MorphoBlue,
  spark: Venue.Spark,
  "compound-v3": Venue.CompoundV3,
};

const SYMBOLS = new Set([
  "WETH",
  "wstETH",
  "ETH",
  "STETH",
  "USDC",
  "USDT",
  "DAI",
  "GHO",
  "USDS",
  "crvUSD",
  "sUSDe",
]);

const CHAIN_NAME_TO_ENUM: Record<string, Chain> = {
  Ethereum: Chain.Mainnet,
  Arbitrum: Chain.Arbitrum,
  Optimism: Chain.Optimism,
  Base: Chain.Base,
};

const poolSchema = z.object({
  pool: z.string(),
  project: z.string(),
  chain: z.string(),
  symbol: z.string(),
  apyBase: z.number().nullable().optional(),
  tvlUsd: z.number().nullable().optional(),
  ltv: z.number().nullable().optional(),
});

const poolsResponse = z.object({
  status: z.string().optional(),
  data: z.array(poolSchema),
});

const lendBorrowSchema = z.object({
  pool: z.string(),
  apyBaseBorrow: z.number().nullable().optional(),
  apyRewardBorrow: z.number().nullable().optional(),
  totalSupplyUsd: z.number().nullable().optional(),
  totalBorrowUsd: z.number().nullable().optional(),
  ltv: z.number().nullable().optional(),
  borrowable: z.boolean().nullable().optional(),
});

const lendBorrowResponse = z.array(lendBorrowSchema);

const aprToBps = (apyPct: number | null | undefined): number | null =>
  apyPct == null ? null : Math.round(apyPct * 100);

const ratioToBps = (r: number | null | undefined): number | null =>
  r == null ? null : Math.round(r * 10000);

export async function fetchDefillamaLendRates(): Promise<LendRate[]> {
  const [poolsRaw, lendBorrowRaw] = await Promise.all([
    fetch(POOLS_URL).then((r) => r.json()),
    fetch(LEND_BORROW_URL).then((r) => r.json()),
  ]);

  const pools = poolsResponse.parse(poolsRaw).data;
  const lendBorrow = lendBorrowResponse.parse(lendBorrowRaw);
  const byPool = new Map(lendBorrow.map((b) => [b.pool, b]));
  const ts = new Date();

  const out: LendRate[] = [];
  for (const p of pools) {
    if (!PROJECTS.includes(p.project as Project)) continue;
    if (!SYMBOLS.has(p.symbol)) continue;
    const chain = CHAIN_NAME_TO_ENUM[p.chain];
    if (!chain) continue;

    const borrow = byPool.get(p.pool);
    out.push({
      chain,
      venue: PROJECT_TO_VENUE[p.project as Project],
      asset: p.symbol,
      supplyAprBps: aprToBps(p.apyBase ?? null),
      borrowAprBps: aprToBps(borrow?.apyBaseBorrow ?? null),
      ltvBps: ratioToBps(p.ltv ?? null),
      lltBps: null,
      emode: false,
      borrowable: borrow?.borrowable ?? false,
      totalSupplyUsd: borrow?.totalSupplyUsd ?? null,
      totalBorrowUsd: borrow?.totalBorrowUsd ?? null,
      ts,
    });
  }
  return out;
}
