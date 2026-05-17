import { z } from "zod";
import { FUNDING_BASIS_SYMBOL_WHITELIST, type Tick, Venue } from "shared";

const INFO_URL = "https://api.hyperliquid.xyz/info";

const WHITELIST = new Set<string>(FUNDING_BASIS_SYMBOL_WHITELIST);

const universeEntry = z.object({ name: z.string() });
const assetCtxEntry = z.object({
  funding: z.string(),
  markPx: z.string().nullable().optional(),
});

const responseSchema = z.tuple([
  z.object({ universe: z.array(universeEntry) }),
  z.array(assetCtxEntry),
]);

export interface HyperliquidFundingTick extends Tick {
  /** Hyperliquid funding accrues hourly. */
  fundingIntervalHours: 1;
}

export async function pollFunding(): Promise<HyperliquidFundingTick[]> {
  const res = await fetch(INFO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "metaAndAssetCtxs" }),
  });
  if (!res.ok) throw new Error(`hyperliquid info ${res.status}: ${await res.text()}`);
  const [meta, ctxs] = responseSchema.parse(await res.json());

  const ts = new Date();
  const out: HyperliquidFundingTick[] = [];
  for (let i = 0; i < meta.universe.length; i++) {
    const name = meta.universe[i].name;
    if (!WHITELIST.has(name)) continue;
    const ctx = ctxs[i];
    if (!ctx) continue;
    out.push({
      venue: Venue.Hyperliquid,
      symbol: name,
      kind: "funding",
      price: ctx.markPx == null ? null : Number(ctx.markPx),
      fundingRate: Number(ctx.funding),
      ts,
      fundingIntervalHours: 1,
    });
  }
  return out;
}
