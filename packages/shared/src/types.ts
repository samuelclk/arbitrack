export enum Venue {
  Binance = "binance",
  Bybit = "bybit",
  OKX = "okx",
  Hyperliquid = "hyperliquid",
  Lighter = "lighter",
  Aster = "aster",
  GRVT = "grvt",
  Deribit = "deribit",
  DefiLlama = "defillama",
  AaveV3 = "aave-v3",
  MorphoBlue = "morpho-blue",
  Spark = "spark",
  CompoundV3 = "compound-v3",
  Lido = "lido",
  Curve = "curve",
  CurveNg = "curve-ng",
  UniswapV3 = "uni-v3",
  Balancer = "balancer",
  Pendle = "pendle",
}

export enum Chain {
  Mainnet = "mainnet",
  Arbitrum = "arbitrum",
  Optimism = "optimism",
  Base = "base",
}

export enum Category {
  Funding = "funding",
  Basis = "basis",
  Peg = "peg",
  Pendle = "pendle",
  Lend = "lend",
  Loop = "loop",
}

export type TickKind = "funding" | "mark" | "spot" | "index" | "futures";

export interface Tick {
  venue: Venue;
  symbol: string;
  kind: TickKind;
  price?: number | null;
  fundingRate?: number | null;
  expiry?: Date | null;
  ts: Date;
}

export interface Opportunity {
  id?: number;
  category: Category;
  pair: string;
  longVenue?: Venue | null;
  shortVenue?: Venue | null;
  chain?: Chain | null;
  spreadBps?: number | null;
  aprBps: number;
  detail: Record<string, unknown>;
  computedAt: Date;
}

export interface LendRate {
  chain: Chain;
  venue: Venue;
  asset: string;
  supplyAprBps?: number | null;
  borrowAprBps?: number | null;
  ltvBps?: number | null;
  lltBps?: number | null;
  emode: boolean;
  borrowable: boolean;
  totalSupplyUsd?: number | null;
  totalBorrowUsd?: number | null;
  ts: Date;
}

export interface PegSnap {
  ts: Date;
  unfinalizedSteth: number;
  lastRequestId: bigint;
  lastFinalizedId: bigint;
  estWaitDays: number;
  bunkerMode: boolean;
  waitSourceType?: string | null;
}

export interface PendleMarket {
  chain: Chain;
  marketAddr: string;
  underlying: "wstETH";
  expiry: Date;
  ptImpliedApyBps: number;
  ytFloatingApyBps?: number | null;
  liquidityUsd?: number | null;
  ts: Date;
}
