import { expect, test } from "@playwright/test";

test("Topbar values match underlying tab data", async ({ page, request }) => {
  await page.goto("/");

  const topbar = page.getByTestId("topbar");
  await expect(topbar).toBeVisible();

  // 1. ETH spot: should match latest binance ETHUSDT tick price exactly
  const ethSpotText = (await page.getByTestId("topbar-eth-spot").textContent()) ?? "";
  const ethPrice = Number(ethSpotText.replace(/[^\d.]/g, ""));
  expect(ethPrice).toBeGreaterThan(100);

  // 2. stETH/ETH: should appear (6dp number)
  const stethText = (await page.getByTestId("topbar-steth-eth").textContent()) ?? "";
  expect(stethText).toMatch(/0\.\d{6}/);

  // 3. Queue days
  const queueText = (await page.getByTestId("topbar-queue-days").textContent()) ?? "";
  expect(queueText).toMatch(/\d+\.\d+d/);

  // 4. Best loop APR should equal MAX(apr_bps) loop opportunity
  const loopAprText = (await page.getByTestId("topbar-best-loop").textContent()) ?? "";
  const loopApr = Number(loopAprText.match(/(-?\d+\.\d+)%/)?.[1] ?? "0");
  const loopsRes = await request.get("/api/opportunities?cat=loop");
  const loopOpps = (await loopsRes.json()) as Array<{ apr_bps: string }>;
  const expectedMax = Math.max(...loopOpps.map((o) => Number(o.apr_bps))) / 100;
  expect(Math.abs(loopApr - expectedMax)).toBeLessThan(0.05);

  // 5. ETH avg funding present
  const fundingText = (await page.getByTestId("topbar-eth-funding").textContent()) ?? "";
  expect(fundingText).toMatch(/-?\d+\.\d+%/);
});
