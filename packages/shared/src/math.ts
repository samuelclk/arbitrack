const YEAR_DAYS = 365;
const DAY_HOURS = 24;
const LOOP_SWAP_FEE = 0.001;

const assertFinite = (name: string, value: number) => {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`);
  }
};

const assertPositive = (name: string, value: number) => {
  assertFinite(name, value);
  if (value <= 0) {
    throw new Error(`${name} must be positive`);
  }
};

export const fundingApr = (rate: number, intervalHours: number) => {
  assertFinite("rate", rate);
  assertPositive("intervalHours", intervalHours);

  return rate * (DAY_HOURS / intervalHours) * YEAR_DAYS;
};

export const basisApr = (futPrice: number, spotPrice: number, daysToExpiry: number) => {
  assertFinite("futPrice", futPrice);
  assertPositive("spotPrice", spotPrice);
  assertPositive("daysToExpiry", daysToExpiry);

  return ((futPrice - spotPrice) / spotPrice) * (YEAR_DAYS / daysToExpiry);
};

export const impliedRedeemApr = (stethPrice: number, waitDays: number) => {
  assertFinite("stethPrice", stethPrice);
  assertPositive("waitDays", waitDays);

  if (stethPrice >= 1) {
    return 0;
  }

  return ((1 - stethPrice) / waitDays) * YEAR_DAYS;
};

export const netLoopApr = (leverage: number, stethApr: number, borrowApr: number) => {
  assertPositive("leverage", leverage);
  assertFinite("stethApr", stethApr);
  assertFinite("borrowApr", borrowApr);

  return stethApr * leverage - borrowApr * (leverage - 1) - LOOP_SWAP_FEE;
};

export const safeLeverage = (lltv: number) => {
  assertFinite("lltv", lltv);
  if (lltv < 0 || lltv >= 1.25) {
    throw new Error("lltv must be in [0, 1.25)");
  }

  return 1 / (1 - 0.8 * lltv);
};

export const pendleSpread = (ptImpliedApy: number, wstethVariableBorrowApr: number) => {
  assertFinite("ptImpliedApy", ptImpliedApy);
  assertFinite("wstethVariableBorrowApr", wstethVariableBorrowApr);

  return ptImpliedApy - wstethVariableBorrowApr;
};

export const crossVenueFundingSpread = (fundingAprA: number, fundingAprB: number) => {
  assertFinite("fundingAprA", fundingAprA);
  assertFinite("fundingAprB", fundingAprB);

  return fundingAprA - fundingAprB;
};
