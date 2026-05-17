import { expect, test } from "@playwright/test";

test("/lend renders rows sorted by borrow APR asc, Aave mainnet WETH present", async ({
  page,
}) => {
  await page.goto("/lend");
  await page.getByTestId("lend-row").first().waitFor({ state: "visible", timeout: 15_000 });

  const rows = await page.getByTestId("lend-row").all();
  expect(rows.length).toBeGreaterThan(5);

  // Aave mainnet WETH row present
  const aaveWeth = page.locator(
    '[data-testid="lend-row"][data-chain="mainnet"][data-venue="aave-v3"][data-asset="WETH"]',
  );
  await expect(aaveWeth).toHaveCount(1);

  // Sort assertion: borrow APR ascending across the visible table
  const aprs: number[] = [];
  for (const row of rows) {
    const cells = await row.locator("td").allTextContents();
    const borrow = cells[4]; // index of borrow APR column
    aprs.push(Number(borrow.replace("%", "")));
  }
  for (let i = 1; i < aprs.length; i++) {
    expect(aprs[i]).toBeGreaterThanOrEqual(aprs[i - 1] - 1e-6);
  }
});
