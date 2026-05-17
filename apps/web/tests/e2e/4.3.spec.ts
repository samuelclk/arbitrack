import { expect, test } from "@playwright/test";

test("/loops renders sorted desc; hand-derived net APR matches within 1 bp", async ({
  page,
  request,
}) => {
  await page.goto("/loops");
  const rows = page.getByTestId("loop-row");
  await rows.first().waitFor({ state: "visible", timeout: 15_000 });
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);

  const aprs: number[] = [];
  for (let i = 0; i < count; i++) {
    aprs.push(Number(await rows.nth(i).getAttribute("data-net-apr-bps")));
  }
  for (let i = 1; i < aprs.length; i++) {
    expect(aprs[i]).toBeLessThanOrEqual(aprs[i - 1] + 1e-6);
  }

  // Hand-derive net APR from /api/opportunities detail + compare to stored apr_bps
  const apiRes = await request.get("/api/opportunities?cat=loop");
  const opps = (await apiRes.json()) as Array<{
    apr_bps: string;
    detail: { leverage: number; stethApr: number; borrowApr: number };
  }>;
  expect(opps.length).toBeGreaterThan(0);
  const o = opps[0];
  const expected =
    o.detail.stethApr * o.detail.leverage -
    o.detail.borrowApr * (o.detail.leverage - 1) -
    0.001;
  const stored = Number(o.apr_bps) / 10_000;
  expect(Math.abs(stored - expected)).toBeLessThan(0.0001); // < 1 bp
});
