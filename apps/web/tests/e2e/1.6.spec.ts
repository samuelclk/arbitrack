import { expect, test } from "@playwright/test";

test("/api/opportunities?cat=funding returns JSON array", async ({ request }) => {
  const res = await request.get("/api/opportunities?cat=funding");
  expect(res.ok()).toBe(true);
  const body = await res.json();
  expect(Array.isArray(body)).toBe(true);
  expect(body.length).toBeGreaterThan(0);
  expect(body[0]).toMatchObject({
    category: "funding",
    pair: expect.any(String),
    apr_bps: expect.anything(),
  });
});
