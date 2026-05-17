import { expect, test } from "@playwright/test";

test("/basis renders rows including BTC quarterly", async ({ page, request }) => {
  await page.goto("/basis");
  const firstRow = page.getByTestId("opportunity-row").first();
  await firstRow.waitFor({ state: "visible", timeout: 15_000 });
  const rowCount = await page.getByTestId("opportunity-row").count();
  expect(rowCount).toBeGreaterThan(0);

  const apiRes = await request.get("/api/opportunities?cat=basis");
  const rows = (await apiRes.json()) as Array<{
    pair: string;
    long_venue: string;
    apr_bps: string;
    detail: { futPrice: number; spotPrice: number };
  }>;
  const btcRow = rows.find((r) => r.pair.startsWith("BTC-"));
  expect(btcRow).toBeTruthy();

  if (btcRow) {
    // Cross-check: our stored basis APR must match a fresh computation from
    // the same fut/spot prices we recorded (within 0.1% absolute).
    const days =
      (new Date(rows.find((r) => r.pair.startsWith("BTC-"))!.pair.slice(4)).getTime() -
        Date.now()) /
      86_400_000;
    const expectedApr =
      ((btcRow.detail.futPrice - btcRow.detail.spotPrice) / btcRow.detail.spotPrice) *
      (365 / Math.max(0.5, days));
    const storedApr = Number(btcRow.apr_bps) / 10_000;
    expect(Math.abs(storedApr - expectedApr)).toBeLessThan(0.001);
  }
});
