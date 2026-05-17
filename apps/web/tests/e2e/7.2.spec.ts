import { expect, test } from "@playwright/test";

test("UpdatedAgo: counter advances 1s/s and resets on poll", async ({ page }) => {
  await page.goto("/test/updated-ago");
  const counter = page.getByTestId("updated-ago");

  await expect(counter).toHaveText("Updated 0s ago");

  await page.waitForTimeout(2_500);
  const advanced = await counter.textContent();
  expect(advanced).toMatch(/Updated [23]s ago/);

  await page.getByTestId("poll").click();
  await expect(counter).toHaveText("Updated 0s ago");
});
