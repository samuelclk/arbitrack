import { z } from "zod";
import { basisApr, FUNDING_BASIS_SYMBOL_WHITELIST, type Tick, Venue } from "shared";

const PREMIUM_INDEX_URL = "https://fapi.binance.com/fapi/v1/premiumIndex";
const FUNDING_INFO_URL = "https://fapi.binance.com/fapi/v1/fundingInfo";
const COINM_EXCHANGE_INFO_URL = "https://dapi.binance.com/dapi/v1/exchangeInfo";
const COINM_TICKER_PRICE_URL = "https://dapi.binance.com/dapi/v1/ticker/price";
const SPOT_TICKER_PRICE_URL = "https://api.binance.com/api/v3/ticker/price";
const ONE_HOUR_MS = 3_600_000;

const WHITELIST_SYMBOLS = new Set(
  FUNDING_BASIS_SYMBOL_WHITELIST.map((s) => `${s}USDT`),
);

const premiumIndexEntry = z.object({
  symbol: z.string(),
  markPrice: z.string(),
  lastFundingRate: z.string(),
  nextFundingTime: z.number().nullable().optional(),
  time: z.number(),
});
const premiumIndexResponse = z.array(premiumIndexEntry);

const fundingInfoEntry = z.object({
  symbol: z.string(),
  fundingIntervalHours: z.number(),
});
const fundingInfoResponse = z.array(fundingInfoEntry);

let fundingInfoCache: { fetchedAt: number; bySymbol: Map<string, number> } | null = null;

async function getFundingIntervalHours(symbol: string): Promise<number> {
  if (!fundingInfoCache || Date.now() - fundingInfoCache.fetchedAt > ONE_HOUR_MS) {
    const res = await fetch(FUNDING_INFO_URL);
    if (!res.ok) throw new Error(`fundingInfo ${res.status}: ${await res.text()}`);
    const parsed = fundingInfoResponse.parse(await res.json());
    fundingInfoCache = {
      fetchedAt: Date.now(),
      bySymbol: new Map(parsed.map((e) => [e.symbol, e.fundingIntervalHours])),
    };
  }
  return fundingInfoCache.bySymbol.get(symbol) ?? 8;
}

export interface BinanceFundingTick extends Tick {
  fundingIntervalHours: number;
}

const exchangeInfoSymbol = z.object({
  symbol: z.string(),
  pair: z.string(),
  contractType: z.string(),
  deliveryDate: z.number(),
  baseAsset: z.string(),
  contractStatus: z.string(),
});

const coinmExchangeInfoResponse = z.object({
  symbols: z.array(exchangeInfoSymbol),
});

const tickerPriceEntry = z.object({
  symbol: z.string(),
  price: z.string(),
  time: z.number().optional(),
});
const tickerPriceListResponse = z.array(tickerPriceEntry);
const tickerPriceSingleResponse = z.union([tickerPriceEntry, tickerPriceListResponse]);

let coinmInfoCache: {
  fetchedAt: number;
  contracts: Array<{ symbol: string; pair: string; baseAsset: string; deliveryDate: number; contractType: string }>;
} | null = null;

async function getCoinmDeliveryContracts() {
  if (!coinmInfoCache || Date.now() - coinmInfoCache.fetchedAt > ONE_HOUR_MS) {
    const res = await fetch(COINM_EXCHANGE_INFO_URL);
    if (!res.ok) throw new Error(`coinm exchangeInfo ${res.status}`);
    const parsed = coinmExchangeInfoResponse.parse(await res.json());
    coinmInfoCache = {
      fetchedAt: Date.now(),
      contracts: parsed.symbols
        .filter(
          (s) =>
            s.contractStatus === "TRADING" &&
            (s.contractType === "CURRENT_QUARTER" || s.contractType === "NEXT_QUARTER"),
        )
        .map((s) => ({
          symbol: s.symbol,
          pair: s.pair,
          baseAsset: s.baseAsset,
          deliveryDate: s.deliveryDate,
          contractType: s.contractType,
        })),
    };
  }
  return coinmInfoCache.contracts;
}

export interface BinanceQuarterlyTick extends Tick {
  /** Annualized basis APR (decimal) — fut vs spot to expiry. */
  basisApr: number;
  spotPrice: number;
  expiryMs: number;
  contractType: string;
}

export async function pollQuarterly(baseAssets: readonly string[] = ["BTC", "ETH", "SOL"]): Promise<BinanceQuarterlyTick[]> {
  const targetBases = new Set(baseAssets);
  const contracts = (await getCoinmDeliveryContracts()).filter((c) => targetBases.has(c.baseAsset));

  // 1 call for all futures prices, 1 call for all spot prices we need
  const [futResRaw, spotResRaw] = await Promise.all([
    fetch(COINM_TICKER_PRICE_URL).then((r) => r.json()),
    fetch(SPOT_TICKER_PRICE_URL).then((r) => r.json()),
  ]);
  const futPrices = tickerPriceListResponse.parse(futResRaw);
  const spotPrices = tickerPriceListResponse.parse(spotResRaw);

  const futBySymbol = new Map(futPrices.map((p) => [p.symbol, Number(p.price)]));
  const spotBySymbol = new Map(spotPrices.map((p) => [p.symbol, Number(p.price)]));

  const now = Date.now();
  const out: BinanceQuarterlyTick[] = [];
  for (const c of contracts) {
    const futPrice = futBySymbol.get(c.symbol);
    const spotPrice = spotBySymbol.get(`${c.baseAsset}USDT`);
    if (futPrice == null || spotPrice == null) continue;
    const daysToExpiry = Math.max(0.5, (c.deliveryDate - now) / 86_400_000);
    out.push({
      venue: Venue.Binance,
      symbol: c.symbol,
      kind: "futures",
      price: futPrice,
      expiry: new Date(c.deliveryDate),
      ts: new Date(now),
      basisApr: basisApr(futPrice, spotPrice, daysToExpiry),
      spotPrice,
      expiryMs: c.deliveryDate,
      contractType: c.contractType,
    });
  }
  return out;
}

export async function pollFunding(): Promise<BinanceFundingTick[]> {
  const res = await fetch(PREMIUM_INDEX_URL);
  if (!res.ok) throw new Error(`premiumIndex ${res.status}: ${await res.text()}`);
  const entries = premiumIndexResponse.parse(await res.json());

  const out: BinanceFundingTick[] = [];
  for (const e of entries) {
    if (!WHITELIST_SYMBOLS.has(e.symbol)) continue;
    const intervalHours = await getFundingIntervalHours(e.symbol);
    out.push({
      venue: Venue.Binance,
      symbol: e.symbol,
      kind: "funding",
      price: Number(e.markPrice),
      fundingRate: Number(e.lastFundingRate),
      ts: new Date(e.time),
      fundingIntervalHours: intervalHours,
    });
  }
  return out;
}
