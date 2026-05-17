import { expect, test } from "@playwright/test";

test("/funding renders rows and UpdatedAgo counter advances", async ({ page }) => {
  await page.goto("/funding");

  // Wait for at least one row from SWR fetch
  const firstRow = page.getByTestId("opportunity-row").first();
  await firstRow.waitFor({ state: "visible", timeout: 15_000 });
  const rowCount = await page.getByTestId("opportunity-row").count();
  expect(rowCount).toBeGreaterThan(0);

  const counter = page.getByTestId("updated-ago");
  const initial = (await counter.textContent()) ?? "";
  expect(initial).toMatch(/Updated \d+s ago/);

  await page.waitForTimeout(2_500);
  const advanced = (await counter.textContent()) ?? "";
  const initialN = Number(initial.match(/(\d+)/)?.[1] ?? "0");
  const advancedN = Number(advanced.match(/(\d+)/)?.[1] ?? "0");
  expect(advancedN).toBeGreaterThanOrEqual(initialN + 2);
});
