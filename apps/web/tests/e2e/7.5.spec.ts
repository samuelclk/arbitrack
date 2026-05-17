import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/test/updated-ago"];

for (const route of ROUTES) {
  test(`footer disclosure is visible on ${route}`, async ({ page }) => {
    await page.goto(route);
    const footer = page.getByTestId("footer");
    await expect(footer).toBeVisible();
    await expect(footer).toContainText("Data sources:");
    await expect(footer).toContainText("Not investment advice.");
  });
}
