import { describe, expect, it } from "vitest";

import {
  Category,
  Chain,
  Venue,
  type LendRate,
  type Opportunity,
  type PegSnap,
  type PendleMarket,
  type Tick,
} from "./types.js";
import {
  categorySchema,
  chainSchema,
  lendRateSchema,
  opportunitySchema,
  pegSnapSchema,
  pendleMarketSchema,
  tickKindSchema,
  tickSchema,
  venueSchema,
} from "./schemas.js";

const jsonRoundTrip = <T>(value: T) =>
  JSON.parse(
    JSON.stringify(value, (_key, entry) => (typeof entry === "bigint" ? entry.toString() : entry)),
  ) as unknown;

describe("shared schemas", () => {
  it("round-trips Venue", () => {
    expect(venueSchema.parse(jsonRoundTrip(Venue.Binance))).toBe(Venue.Binance);
  });

  it("round-trips Chain", () => {
    expect(chainSchema.parse(jsonRoundTrip(Chain.Mainnet))).toBe(Chain.Mainnet);
  });

  it("round-trips Category", () => {
    expect(categorySchema.parse(jsonRoundTrip(Category.Funding))).toBe(Category.Funding);
  });

  it("round-trips TickKind", () => {
    expect(tickKindSchema.parse(jsonRoundTrip("funding"))).toBe("funding");
  });

  it("round-trips Tick", () => {
    const tick: Tick = {
      venue: Venue.Binance,
      symbol: "BTC",
      kind: "funding",
      price: 102500.25,
      fundingRate: 0.0001,
      expiry: null,
      ts: new Date("2026-05-17T00:00:00.000Z"),
    };

    expect(tickSchema.parse(jsonRoundTrip(tick))).toEqual(tick);
  });

  it("round-trips Opportunity", () => {
    const opportunity: Opportunity = {
      id: 1,
      category: Category.Funding,
      pair: "BTC",
      longVenue: Venue.Binance,
      shortVenue: Venue.OKX,
      chain: null,
      spreadBps: 12.5,
      aprBps: 1800,
      detail: { intervalHours: 8 },
      computedAt: new Date("2026-05-17T00:01:00.000Z"),
    };

    expect(opportunitySchema.parse(jsonRoundTrip(opportunity))).toEqual(opportunity);
  });

  it("round-trips LendRate", () => {
    const lendRate: LendRate = {
      chain: Chain.Mainnet,
      venue: Venue.AaveV3,
      asset: "WETH",
      supplyAprBps: 210,
      borrowAprBps: 325,
      ltvBps: 8000,
      lltBps: 8250,
      emode: false,
      borrowable: true,
      totalSupplyUsd: 1_000_000,
      totalBorrowUsd: 500_000,
      ts: new Date("2026-05-17T00:02:00.000Z"),
    };

    expect(lendRateSchema.parse(jsonRoundTrip(lendRate))).toEqual(lendRate);
  });

  it("round-trips PegSnap", () => {
    const pegSnap: PegSnap = {
      ts: new Date("2026-05-17T00:03:00.000Z"),
      unfinalizedSteth: 12_500.75,
      lastRequestId: 123n,
      lastFinalizedId: 100n,
      estWaitDays: 2.5,
      bunkerMode: false,
      waitSourceType: "exitValidators",
    };

    expect(pegSnapSchema.parse(jsonRoundTrip(pegSnap))).toEqual(pegSnap);
  });

  it("round-trips PendleMarket", () => {
    const pendleMarket: PendleMarket = {
      chain: Chain.Mainnet,
      marketAddr: "0x0000000000000000000000000000000000000001",
      underlying: "wstETH",
      expiry: new Date("2026-06-25T00:00:00.000Z"),
      ptImpliedApyBps: 238.2,
      ytFloatingApyBps: 310,
      liquidityUsd: 10_000_000,
      ts: new Date("2026-05-17T00:04:00.000Z"),
    };

    expect(pendleMarketSchema.parse(jsonRoundTrip(pendleMarket))).toEqual(pendleMarket);
  });
});
