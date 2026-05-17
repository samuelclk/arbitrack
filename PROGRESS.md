# ArbiTrack — Build Progress (Ralph loop work queue)

> **Loop reads top-to-bottom, picks first `[ ]` whose deps are all `[x]`.**
> Mark `[x]` on pass, `[!]` + `BLOCKED: <error>` on hard fail.
> Each task ID is stable — do not renumber.

---

## Phase 0 — Foundation

- [x] **0.1** pnpm-workspace.yaml + root package.json with `dev:web`, `dev:worker`, `db:migrate`, `test` scripts. (deps: none) → verify: `pnpm install` succeeds
- [x] **0.2** `.env.example` with `DATABASE_URL`, `ALCHEMY_KEY`, `PENDLE_API_BASE=https://api-v2.pendle.finance/core` (single Alchemy team key works across all chains). (deps: 0.1) → verify: file present with all 3 keys
- [x] **0.3** `packages/shared` scaffold (tsconfig, package.json, src/index.ts barrel). (deps: 0.1) → verify: `pnpm -F shared build` succeeds
- [x] **0.4** `packages/shared/src/types.ts` — Venue, Chain, Category enums; Tick, Opportunity, LendRate, PegSnap, PendleMarket interfaces per SPEC §4. (deps: 0.3) → verify: `tsc --noEmit -p packages/shared`
- [x] **0.5** `packages/shared/src/schemas.ts` — zod mirrors of every type in 0.4. (deps: 0.4) → verify: `pnpm -F shared test` (one round-trip per schema)
- [x] **0.6** `packages/shared/src/math.ts` + `math.test.ts` — all 6 formulas from SPEC §3, ≥2 cases each. (deps: 0.5) → verify: `pnpm -F shared test` passes ≥12 assertions
- [x] **0.7** `packages/shared/src/constants.ts` — addresses + chain IDs + symbol whitelist from SPEC §6. (deps: 0.4) → verify: `tsc --noEmit` clean
- [x] **0.8** `apps/worker` scaffold (tsx runner, src/index.ts logs "worker up"). (deps: 0.1) → verify: `pnpm dev:worker` prints "worker up" then exits cleanly
- [x] **0.9** `apps/web` scaffold (Next.js 14 App Router, page renders "ArbiTrack"). (deps: 0.1) → verify: dev server on :3000 returns 200 with "ArbiTrack"
- [x] **0.10** `apps/worker/src/db/client.ts` — pg pool against `DATABASE_URL`. (deps: 0.8) → verify: `tsx scripts/db-ping.ts` prints "ok"
- [x] **0.11** `apps/worker/db/migrations/0001_init.sql` with all 9 tables from SPEC §4 + `pnpm db:migrate` runner. (deps: 0.10) → verify: `psql $DATABASE_URL -c "\dt"` lists 9 tables
- [x] **0.12** `apps/worker/src/chain/clients.ts` — viem clients per chain + multicall3 healthcheck. (deps: 0.7, 0.8) → verify: `tsx scripts/rpc-ping.ts` prints latest block per chain

---

## Phase 1 — Funding (Feature 3, validates pipeline end-to-end)

- [x] **1.1** `apps/worker/src/adapters/cex/binance.ts` `pollFunding()` → Tick[]. Per SPEC §2.1. (deps: 0.5, 0.10) → verify: `tsx scripts/probe-binance.ts` prints ≥10 funding rows for whitelist symbols
- [x] **1.2** `apps/worker/src/adapters/cex/bybit.ts` `pollFunding()`. (deps: 1.1 for shape) → verify: probe-bybit prints ≥10 rows
- [x] **1.3** `apps/worker/src/adapters/cex/okx.ts` `pollFunding()`. (deps: 1.1) → verify: probe-okx prints ≥10 rows
- [x] **1.4** `apps/worker/src/adapters/cex/hyperliquid.ts` `pollFunding()` via POST /info `metaAndAssetCtxs`. (deps: 1.1) → verify: probe-hyperliquid prints ≥10 rows
- [x] **1.4a** `apps/worker/src/adapters/cex/lighter.ts` `pollFunding()` — GET `mainnet.zklighter.elliot.ai/api/v1/funding-rates`, filter `exchange=="lighter"`, return Tick[]. Per SPEC §2.1. (deps: 1.1) → verify: probe-lighter prints ≥10 rows with `BTC`/`ETH`/`SOL` present
- [x] **1.4b** `apps/worker/src/adapters/cex/aster.ts` `pollFunding()` — GET `fapi.asterdex.com/fapi/v3/premiumIndex` (Binance-compatible shape, can reuse Binance parser). Per SPEC §2.1. (deps: 1.1) → verify: probe-aster prints ≥10 rows
- [x] **1.4c** `apps/worker/src/adapters/cex/grvt.ts` `pollFunding()` — POST `market-data.grvt.io/full/v1/ticker` per-instrument loop over BTC_USDT_Perp + top-20 perps fetched from `/full/v1/instruments` (which also provides `funding_interval_hours` per market). Nanosecond timestamps. **MUST verify `funding_rate` scale on first run — sample value `0.0096` may be decimal/percent/annualized; cross-check against GRVT UI for one symbol before storing.** Per SPEC §2.1. (deps: 1.1) → verify: probe-grvt prints ≥10 rows with funding_rate values that yield APRs ∈ (-200%, +200%) after annualization
- [x] **1.5** `apps/worker/src/engine/funding.ts` — read latest tick per (venue,symbol), compute directed spreads, upsert `opportunities`. Includes CEX (Binance/Bybit/OKX/Hyperliquid) + DEX (Lighter/Aster/GRVT). (deps: 1.1, 1.2, 1.3, 1.4, 1.4a, 1.4b, 1.4c) → verify: run worker 30s; `SELECT COUNT(*) FROM opportunities WHERE category='funding'` > 0 AND `SELECT COUNT(DISTINCT long_venue) FROM opportunities WHERE category='funding'` ≥ 7
- [x] **1.6** `apps/web/app/api/opportunities/route.ts` (GET, filter by `?cat=`, 5s in-memory cache). (deps: 0.9, 0.11) → verify: `curl localhost:3000/api/opportunities?cat=funding` returns JSON array
- [x] **1.7** `apps/web/app/(tabs)/funding/page.tsx` + `OpportunityRow` + `useSWR` hook. (deps: 1.6) → verify: /funding renders rows; manual "Updated Xs ago" counter advances
- [x] **1.8** Spot-check 1 funding rate against Binance per SPEC §7.1. (deps: 1.7) → verify: values match to 6 dp

---

## Phase 2 — Basis (Feature 4)

- [x] **2.1** `apps/worker/src/adapters/cex/binance.ts` add `pollQuarterly()`. Per SPEC §2.2. (deps: 1.1) → verify: probe prints ≥2 BTC contracts with computed basis_apr
- [x] **2.2** `apps/worker/src/adapters/cex/okx.ts` add `pollQuarterly()`. (deps: 1.3) → verify: probe prints ≥2 contracts
- [x] **2.3** `apps/worker/src/adapters/cex/deribit.ts` `pollQuarterly()`. (deps: 1.1) → verify: probe prints ≥3 contracts (BTC/ETH/SOL)
- [x] **2.4** `apps/worker/src/engine/basis.ts` — upsert opportunities (category='basis'). (deps: 2.1, 2.2, 2.3) → verify: `SELECT COUNT(*) WHERE category='basis'` > 0
- [x] **2.5** `apps/web/app/(tabs)/basis/page.tsx`. (deps: 1.6, 2.4) → verify: /basis renders; one BTC quarterly basis cross-checks vs CoinGlass within 0.1%

---

## Phase 3 — Lending rates (Feature 5, first on-chain integration)

- [x] **3.1** `apps/worker/src/adapters/defillama/yields.ts` — GET yields.llama.fi/pools AND /lendBorrow, join on `pool` uuid, filter per SPEC §2.3 (includes WETH/wstETH/ETH + stables USDC/USDT/DAI/GHO/USDS/crvUSD/sUSDe). (deps: 0.5) → verify: probe prints ≥40 pools across 4 chains
- [x] **3.2** `apps/worker/src/adapters/chain/aave-v3.ts` — multicall `getReserveData` + `getConfiguration` per chain. (deps: 0.12) → verify: probe prints WETH+wstETH LLTV/borrow rate for mainnet/Arb/OP/Base (8 rows)
- [x] **3.3** `apps/worker/src/adapters/chain/morpho-blue.ts` — subgraph query for top wstETH-collateral markets. (deps: 0.5) → verify: probe prints ≥3 markets with lltv + borrow apy
- [x] **3.4** `apps/worker/src/adapters/chain/spark.ts` (Aave-fork ABI, mainnet only). (deps: 3.2) → verify: probe prints WETH + wstETH rows
- [x] **3.5** `apps/worker/src/engine/lend.ts` — write `lend_rates`; compute borrow-dispersion → opportunities (category='lend'). (deps: 3.1, 3.2, 3.3, 3.4) → verify: `SELECT DISTINCT chain, venue FROM lend_rates` returns ≥6 combinations
- [x] **3.6** `apps/web/app/(tabs)/lend/page.tsx` (table sorted by borrow APR asc). (deps: 1.6, 3.5) → verify: /lend renders; Aave mainnet WETH borrow matches app.aave.com within 5 bps per SPEC §7.2

---

## Phase 4 — Loops (Feature 6, pure derivation)

- [x] **4.1** `apps/worker/src/adapters/lido/apr.ts` — fetch stake.lido.fi/api/sma-steth-apr; fallback to on-chain share-rate delta. (deps: 0.12) → verify: probe prints APR ∈ (2%, 6%)
- [x] **4.2** `apps/worker/src/engine/loop.ts` — for each (venue, chain) with wstETH collateral + ETH borrow, compute `net_apr(safe_leverage)`; upsert opportunities (category='loop'). (deps: 3.5, 4.1) → verify: `SELECT MAX(apr_bps) FROM opportunities WHERE category='loop'` > stETH_apr_bps
- [x] **4.3** `apps/web/app/(tabs)/loops/page.tsx` (sorted by net APR desc, health buffer column). (deps: 1.6, 4.2) → verify: /loops renders; hand-derived cell matches within 1 bp

---

## Phase 5 — Peg & withdrawals (Feature 1, headline)

- [x] **5.1** `apps/worker/src/adapters/lido/queue.ts` — read WithdrawalQueueERC721 per SPEC §6.2. (deps: 0.12) → verify: probe prints non-zero stETH queue size
- [x] **5.2** `apps/worker/src/adapters/lido/wait-time.ts` — fetch wq-api.lido.fi. (deps: 0.5) → verify: probe prints wait days for 1 ETH and 1000 ETH amounts
- [x] **5.3** `apps/worker/src/adapters/chain/curve-steth.ts` — `get_dy(1, 0, 1e18)` on stETH pool. (deps: 0.12) → verify: probe prints price ∈ (0.99, 1.001)
- [!] **5.4** `apps/worker/src/adapters/chain/uni-v3-wsteth.ts` + `balancer-wsteth.ts`. (deps: 0.12) → verify: probes print prices; max-min spread <0.5%
  BLOCKED: SPEC Balancer pool 0x32296969...0230 has only ~0.0857 wstETH / 0.0994 WETH on-chain (queryBatchSwap returns 0.099 WETH for 1 wstETH in — correct call, dead pool). Uni v3 + Curve adapters fine; need live Balancer pool in SPEC.
- [ ] **5.5** `apps/worker/src/engine/peg.ts` — compute `implied_redeem_apr` from best discount × shortest wait; write `lido_queue` + opportunities (category='peg'). (deps: 5.1, 5.2, 5.3, 5.4) → verify: peg row exists in opportunities, `computed_at` within 5min
- [ ] **5.6** `apps/web/app/(tabs)/peg/page.tsx` + headline hero card on `/`. (deps: 1.6, 5.5) → verify: / renders hero with Implied Redeem APR; /peg renders detail

---

## Phase 6 — Pendle (Feature 2)

- [x] **6.1** `apps/worker/src/adapters/pendle/markets.ts` — GET api-v2.pendle.finance markets, filter to **wstETH only** (per SPEC §2.6 scope — no weETH/ezETH). (deps: 0.5) → verify: probe prints ≥3 markets with implied APY + expiry
- [x] **6.2** `apps/worker/src/engine/pendle.ts` — for each Pendle wstETH market, fetch matching wstETH borrow rate from `lend_rates`; compute `pendle_spread`; upsert opportunities (category='pendle'). (deps: 3.5, 6.1) → verify: `SELECT COUNT(*) WHERE category='pendle'` > 0
- [x] **6.3** `apps/web/app/(tabs)/pendle/page.tsx` (table: market, expiry, PT APY, wstETH borrow APR, spread). Expect ~3 rows. (deps: 1.6, 6.2) → verify: /pendle renders; PT yield cross-checks vs pendle.finance UI within 10 bps per SPEC §7.3

---

## Phase 7 — Shell polish

- [ ] **7.1** `apps/web/app/components/Topbar.tsx` (ETH spot, stETH/ETH, queue days, best loop APR, ETH avg funding). (deps: 5.6, 4.3, 1.7) → verify: topbar values match underlying tab data
- [x] **7.2** `apps/web/app/components/UpdatedAgo.tsx`. (deps: 0.9) → verify: counter advances 1s/s, resets on poll
- [ ] **7.3** `apps/web/app/components/Sparkline.tsx` (inline SVG from `spread_hourly`). (deps: 7.4) → verify: peg + funding + lend rows render 24-point sparklines
- [ ] **7.4** `apps/worker/src/engine/rollup.ts` — incremental `spread_hourly` maintenance, cron 5min. (deps: 1.5, 2.4, 3.5, 4.2, 5.5, 6.2) → verify: `SELECT COUNT(*) FROM spread_hourly > 0` after 1h runtime
- [x] **7.5** Footer disclosure component (data sources per tab, not-investment-advice). (deps: 0.9) → verify: visible at bottom of every tab

---

## Phase 8 — Deploy

- [ ] **8.1** Vercel deploy of apps/web (env vars set, build passes). (deps: all Phase 7) → verify: curl `<vercel-url>/api/opportunities` returns 200
- [ ] **8.2** Fly.io machine for apps/worker (Dockerfile, fly.toml, 256MB). (deps: all Phase 7) → verify: `fly logs` shows tick lines from all 4 CEX + lend cycle
- [ ] **8.3** README.md with setup + deploy steps. (deps: 8.1, 8.2) → verify: ≥10 sections present
