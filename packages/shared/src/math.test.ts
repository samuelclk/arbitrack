import { describe, expect, it } from "vitest";

import {
  basisApr,
  crossVenueFundingSpread,
  fundingApr,
  impliedRedeemApr,
  netLoopApr,
  pendleSpread,
  safeLeverage,
} from "./math.js";

describe("fundingApr", () => {
  it("annualizes 8 hour funding", () => {
    expect(fundingApr(0.0001, 8)).toBeCloseTo(0.1095, 10);
  });

  it("annualizes hourly funding", () => {
    expect(fundingApr(0.000032, 1)).toBeCloseTo(0.28032, 10);
  });
});

describe("basisApr", () => {
  it("returns positive contango APR", () => {
    expect(basisApr(105, 100, 90)).toBeCloseTo(0.2027777778, 10);
  });

  it("returns negative backwardation APR", () => {
    expect(basisApr(98, 100, 30)).toBeCloseTo(-0.2433333333, 10);
  });
});

describe("impliedRedeemApr", () => {
  it("returns discount annualized over wait days", () => {
    expect(impliedRedeemApr(0.995, 5)).toBeCloseTo(0.365, 10);
  });

  it("returns zero when stETH is at or above par", () => {
    expect(impliedRedeemApr(1.001, 5)).toBe(0);
  });
});

describe("netLoopApr", () => {
  it("subtracts borrow cost and swap fee", () => {
    expect(netLoopApr(3, 0.03, 0.02)).toBeCloseTo(0.049, 10);
  });

  it("handles one times leverage as plain staking minus fee", () => {
    expect(netLoopApr(1, 0.03, 0.02)).toBeCloseTo(0.029, 10);
  });
});

describe("safeLeverage", () => {
  it("computes buffer-adjusted leverage for 80% LLTV", () => {
    expect(safeLeverage(0.8)).toBeCloseTo(2.7777777778, 10);
  });

  it("returns one times leverage for zero LLTV", () => {
    expect(safeLeverage(0)).toBe(1);
  });
});

describe("pendleSpread", () => {
  it("returns positive spread when PT APY is higher", () => {
    expect(pendleSpread(0.045, 0.032)).toBeCloseTo(0.013, 10);
  });

  it("returns negative spread when borrow APR is higher", () => {
    expect(pendleSpread(0.02, 0.035)).toBeCloseTo(-0.015, 10);
  });
});

describe("crossVenueFundingSpread", () => {
  it("subtracts venue b from venue a", () => {
    expect(crossVenueFundingSpread(0.18, 0.12)).toBeCloseTo(0.06, 10);
  });

  it("can return negative spreads", () => {
    expect(crossVenueFundingSpread(0.08, 0.11)).toBeCloseTo(-0.03, 10);
  });
});
