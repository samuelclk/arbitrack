import { expect, test } from "@playwright/test";

test("/ renders hero with Implied Redeem APR", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("hero")).toBeVisible();
  await expect(page.getByText("Implied Redeem APR")).toBeVisible();
  const apr = await page.getByTestId("hero-apr").textContent();
  expect(apr).toMatch(/\d+\.\d+%/);
});

test("/peg renders detail table", async ({ page }) => {
  await page.goto("/peg");
  await expect(page.getByTestId("peg-detail")).toBeVisible();
  await expect(page.getByText("implied redeem APR")).toBeVisible();
  await expect(page.getByText("wait days (1 ETH)")).toBeVisible();
});
