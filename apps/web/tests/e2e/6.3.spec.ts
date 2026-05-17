import { expect, test } from "@playwright/test";

test("/pendle renders ≥1 row; PT APY cross-checks vs api-v2.pendle.finance within 10 bps", async ({
  page,
  request,
}) => {
  await page.goto("/pendle");
  const rows = page.getByTestId("pendle-row");
  await rows.first().waitFor({ state: "visible", timeout: 15_000 });
  const count = await rows.count();
  expect(count).toBeGreaterThanOrEqual(1);

  // Map chain → chainId for Pendle API
  const chainId: Record<string, number> = { mainnet: 1, arbitrum: 42161, base: 8453 };

  // Take first row and verify its PT APY against live Pendle API
  const first = rows.first();
  const chain = await first.getAttribute("data-chain");
  const market = await first.getAttribute("data-market");
  const storedPtApy = Number(await first.getAttribute("data-pt-apy"));

  const apiRes = await request.get(
    `https://api-v2.pendle.finance/core/v1/${chainId[chain ?? "mainnet"]}/markets/active`,
  );
  expect(apiRes.ok()).toBe(true);
  const body = (await apiRes.json()) as {
    markets: Array<{ address: string; details: { impliedApy: number } }>;
  };
  const live = body.markets.find(
    (m) => m.address.toLowerCase() === market?.toLowerCase(),
  );
  expect(live).toBeTruthy();
  if (live) {
    expect(Math.abs(live.details.impliedApy - storedPtApy)).toBeLessThan(0.001); // 10 bps
  }
});
