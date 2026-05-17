import { expect, test } from "@playwright/test";

for (const route of ["/peg", "/funding", "/lend"]) {
  test(`sparkline svg renders on ${route}`, async ({ page }) => {
    await page.goto(route);
    // Wait for any content to load (rows or empty state)
    await page.waitForLoadState("networkidle");
    const sparklines = page.getByTestId("sparkline");
    const count = await sparklines.count();
    expect(count).toBeGreaterThan(0);

    // Verify the component caps at 24 points (max attribute) even with more data
    for (let i = 0; i < Math.min(3, count); i++) {
      const pts = Number(await sparklines.nth(i).getAttribute("data-points"));
      expect(pts).toBeLessThanOrEqual(24);
    }
  });
}
