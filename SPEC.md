# ArbiTrack — Technical Spec (frozen reference for Ralph loop)

> **DO NOT EDIT during the Ralph loop.** This file is the immutable reference. All implementation details, addresses, endpoints, formulas, and schemas live here. Tasks in PROGRESS.md reference sections of this file by number (e.g. "SPEC §3.4").

> **Scope tightening (2026-05-17):** Product focuses exclusively on **wstETH as collateral**, with debt in **stablecoins (USDC, USDT, DAI, GHO, USDS, crvUSD)** or **native ETH/WETH**. NO other LSTs (rETH, cbETH, frxETH, mETH, swETH, ETHx) and NO LRTs (weETH, ezETH, rsETH, pufETH). See §8.

---

## 1. Architecture

### 1.1 Monorepo layout (pnpm workspaces)

```
arbitrack/
├── pnpm-workspace.yaml
├── package.json                  # root, scripts only
├── .env.example                  # secrets template
├── apps/
│   ├── web/                      # Next.js 14 App Router, deployed to Vercel
│   └── worker/                   # tsx-run Node, deployed to Fly.io
└── packages/
    └── shared/                   # types, zod schemas, math, constants
```

### 1.2 Worker / Web split

- **Worker**: long-running Node process. Polls all data sources, writes to Postgres. No HTTP server.
- **Web**: Next.js. Server components read Postgres for initial SSR; client SWR polls `/api/opportunities` every 10s.
- **Shared types** (`packages/shared`) are imported by both.

### 1.3 Polling cadences

| Source class | Cadence | Rationale |
|---|---|---|
| CEX REST (funding, basis) | 10s | Free, fast, no rate-limit risk at this rate |
| On-chain DEX prices (Curve, Uni, Balancer) | 30s | Multicall keeps RPC cost low |
| Lending rates (DefiLlama + on-chain top-up) | 60s | Rates change slowly |
| Pendle PT yields | 60s | Same |
| Lido queue length | 5min | Validator exit dynamics are slow |
| Lido stETH APR | 1h | Rebases daily |
| Hourly rollup (spread_hourly) | 5min | Incremental aggregate maintenance |

### 1.4 Database — Postgres (Neon or local)

- Default: Neon free tier (0.5 GB, autoscaling); local Postgres via Docker also supported.
- No Timescale. Plain `timestamptz`-indexed tables.
- `ticks` is monthly-partitioned via `pg_partman` if volume exceeds 1 GB; defer to operational need.
- Migrations are plain SQL files in `apps/worker/db/migrations/`, applied by `pnpm db:migrate`.

### 1.5 RPC strategy

- **viem** for all RPC. `multicall3` batches per-chain reads into single HTTP calls.
- **Single Alchemy team API key** (`ALCHEMY_KEY`) — works across all enabled networks. URLs constructed as `https://<network>.g.alchemy.com/v2/${ALCHEMY_KEY}`.
- Free-tier compute units sufficient given multicall + 30–60s cadences.
- All RPC calls flow through `getChainClient(chainId)` helper in `apps/worker/src/chain/clients.ts`.

---

## 2. Data sources (per feature)

### 2.1 Funding (Feature 3)

| Venue | Endpoint | Method | Funding interval | Notes |
|---|---|---|---|---|
| Binance | `https://fapi.binance.com/fapi/v1/premiumIndex` | GET | usually 8h | Returns all USDT-M perps in one call. Field: `lastFundingRate`. **Some symbols use 4h or 1h** — fetch `/fapi/v1/fundingInfo` and use `fundingIntervalHours` per symbol; cache hourly. |
| Bybit | `https://api.bybit.com/v5/market/tickers?category=linear` | GET | varies | Funding in tickers response. Fields: `fundingRate`, `nextFundingTime`, **`fundingIntervalHour`** (string, source of truth — use this). |
| OKX | `https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP` | GET | 8h | **Per-instrument only — no batch.** Loop over whitelist; rate limit 20 req/2s per IP. Interval inferred from `fundingTime`/`nextFundingTime` delta. |
| Hyperliquid | `https://api.hyperliquid.xyz/info` | POST `{"type":"metaAndAssetCtxs"}` | **1h** | All perps in one call. `funding` is **hourly decimal rate**. **ANNUALIZE × 8760** (24 × 365), NOT × 1095. Common bug. |

**Reference impl**: [`jose-donato/crypto-futures-arbitrage-scanner`](https://github.com/jose-donato/crypto-futures-arbitrage-scanner) — Go, multi-venue (spot-vs-perp WS, different problem but useful pattern: one goroutine per exchange + fanout channel).

**Cross-check UIs**: [coinglass.com/FundingRate](https://www.coinglass.com/FundingRate), [coinalyze.net](https://coinalyze.net).

### 2.2 Basis / Quarterly futures (Feature 4)

| Venue | Endpoint | Notes |
|---|---|---|
| Binance | `https://dapi.binance.com/dapi/v1/ticker/price` for COIN-M delivery (e.g. `BTCUSD_260628`). Expiry from `https://dapi.binance.com/dapi/v1/exchangeInfo` → `symbols[].deliveryDate` (ms epoch) + `contractType ∈ {CURRENT_QUARTER, NEXT_QUARTER}`. Spot via `api.binance.com/api/v3/ticker/price`. Cache exchangeInfo hourly. |
| OKX | `https://www.okx.com/api/v5/market/tickers?instType=FUTURES` for delivery contracts. Expiry from `https://www.okx.com/api/v5/public/instruments?instType=FUTURES&uly=BTC-USDT` → `expTime` (ms). Cache hourly. |
| Deribit | `https://www.deribit.com/api/v2/public/get_instruments?currency=BTC&kind=future&expired=false` then `/public/ticker?instrument_name=...`. **BTC + ETH only — Deribit has no SOL futures.** Filter `settlement_period` for quarterlies. Expiry in `expiration_timestamp` (ms). |

### 2.3 Lending (Feature 5)

**Primary source**: DefiLlama Yields API — **two endpoints, joined on `pool` UUID** (this differs from the original spec).

```ts
// 1. Supply side
const pools = await fetch('https://yields.llama.fi/pools').then(r => r.json());
// 2. Borrow side
const lendBorrow = await fetch('https://yields.llama.fi/lendBorrow').then(r => r.json());
// Join:
const byPool = new Map(lendBorrow.map(b => [b.pool, b]));
const rates = pools.data
  .filter(p =>
    ['aave-v3', 'morpho-blue', 'spark', 'compound-v3'].includes(p.project) &&
    // wstETH (collateral side) + the borrowable assets we care about
    ['WETH', 'wstETH', 'ETH', 'STETH',
     'USDC', 'USDT', 'DAI', 'GHO', 'USDS', 'crvUSD', 'sUSDe'].includes(p.symbol) &&
    ['Ethereum', 'Arbitrum', 'Optimism', 'Base'].includes(p.chain))
  .map(p => ({ ...p, borrow: byPool.get(p.pool) }));
```

- `/pools` fields used: `pool` (UUID), `project`, `chain`, `symbol`, `apyBase` (supply APY %), `tvlUsd`, `ltv` (note: non-eMode).
- `/lendBorrow` fields used: `pool`, `apyBaseBorrow`, `apyRewardBorrow`, `totalSupplyUsd`, `totalBorrowUsd`, `ltv`, `borrowable`, `borrowFactor`.
- Update frequency: ~hourly per DefiLlama; poll once per minute is safe.
- Filter test (May 2026): yields ~79 wstETH/WETH/ETH pools across our 4 chains + 4 protocols. Adding stables roughly doubles that.

**On-chain top-up** (for eMode LLTV, asset configs DefiLlama doesn't surface):

- **Aave v3**: prefer `UiPoolDataProviderV3.getReservesData(provider)` — one multicall returns all reserves + base configs + eMode data. Per-asset eMode in v3.2 lives in **separate bitmap APIs** (`getReserveEModeCategory(asset)` + `getEModeCategoryData(id)` + `getEModeCategoryCollateralBitmap(id)` + `getEModeCategoryBorrowableBitmap(id)`), NOT in the `ReserveConfigurationMap` bitmap. Current ETH-correlated eMode (mainnet) gives ~93% LTV / 95% LT for wstETH↔ETH; Base gives 90% / 93%.
- **Morpho Blue**: GraphQL `https://blue-api.morpho.org/graphql`, no auth. **Field is `marketId` (the old `uniqueKey` is removed as of 2026-05-20)**. Multi-chain via `chainId_in: [1, 8453, 42161]`. Big wstETH/WETH markets: `0xb8fc70e8...` (LLTV 96.5%, $112M supply, flagship), `0xd0e50cda...` (LLTV 94.5%, $20.8M).
- **Spark**: SparkLend `0xC13e21B648A5Ee794902342038FF3aDAB66BE987` — **mainnet only** (Spark on L2s is Savings/PSM, not lending). Same ABI as Aave v3. Drop from L2 rate columns.
- **Compound v3 (Comet)**: per-market proxy contracts (see §6.6). `getUtilization()` → `getSupplyRate(util)` + `getBorrowRate(util)` (per-second, scale 1e18). **wstETH appears only as collateral in Comet** — earns no supply APY (collateral doesn't earn in Comet). For Feature 5 the WETH and USDC base markets matter.

### 2.4 Looping (Feature 6)

**stETH APR**:
- **Lido API** (verified): `GET https://eth-api.lido.fi/v1/protocol/steth/apr/sma` — 7-day SMA, JSON shape `{ data: { aprs: [...], smaApr: <number> }, meta: { ... } }`. (The previously-spec'd `stake.lido.fi/api/sma-steth-apr` is dead — 404.)
- **Last value**: `GET https://eth-api.lido.fi/v1/protocol/steth/apr/last` → `{ data: { timeUnix, apr }, meta: { ... } }`.
- **On-chain canonical**: `Lido.getPooledEthByShares(1e18)` delta over 24h. Lido address: `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`.

**Looping math** (ETH-loop only — stablecoin extraction is NOT modeled in this feature; see §8 scope):
- Inputs: `stETH_apr`, per-(venue,chain) ETH borrow APR, per-(venue,chain) wstETH-as-collateral LLTV (prefer eMode value).
- `safe_leverage = 1 / (1 − 0.8 × LLTV)` (80% of max LTV as safety buffer).
- `net_apr(L) = stETH_apr × L − borrow_apr × (L − 1) − 0.0010` (10 bps round-trip swap fee).

**Reference**:
- [Index Coop wstETH15x](https://www.indexcoop.com/blog/introducing-smart-loops-wsteth15x) — productized 15x loop on Morpho.
- [Summer.fi](https://summer.fi) — multi-protocol multiply UI.

### 2.5 Peg & Withdrawals (Feature 1, headline)

**Lido withdrawal queue** (on-chain reads):
- **WithdrawalQueueERC721**: `0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1` (OssifiableProxy → impl `0xe42c659dc09109566720ea8b2de186c2be7d94d9`)
- `unfinalizedStETH() → uint256` (stETH in queue, 18 dec)
- `getLastRequestId() → uint256` and `getLastFinalizedRequestId() → uint256`
- Bonus: `isBunkerModeActive() → bool` — corroborates API bunker signal.

**Lido withdrawals-api** (wait-time estimate) — CORRECTED PATH + UNITS:
- Source: [`lidofinance/withdrawals-api`](https://github.com/lidofinance/withdrawals-api/tree/develop)
- Endpoint: `GET https://wq-api.lido.fi/v2/request-time/calculate?amount=<WHOLE_ETHER>` (e.g. `?amount=1000`). **Amount is whole ETH, NOT wei. Capped at 1_000_000_000_000.**
- Response: `{ requestInfo: { finalizationIn: <ms>, finalizationAt: <ISO string>, type: 'bunker' | 'vaultsBalance' | 'exitValidators' | 'rewardsOnly' | 'requestTimestampMargin' }, status, nextCalculationAt }`.
- **Prefer `finalizationAt` (ISO timestamp)** over `finalizationIn` to avoid ms/s confusion.
- Rate limit: ~30 req per 30s per IP. Cache results client-side.
- **Estimate skew**: API skews ~24h optimistic for waits >2 days (mean error ≈ -24h, see [accuracy study](https://asatzger.github.io/lido-api-accuracy/)). Apply +24h margin for waits >2 days, or display confidence band.

**DEX price sources** (mainnet):
- **Curve stETH/ETH (old pool)**: `0xDC24316b9AE028F1497c275EB9192a3Ea0f67022` — `get_dy(int128 i, int128 j, uint256 dx) → uint256`. **Indices: i=0 is ETH (native), i=1 is stETH.** To price stETH→ETH: `get_dy(1, 0, 1e18)`.
- **Curve stETH-ng (new pool)**: `0x21E27a5E5513D6e65C4f830167390997aA84843a` — same ABI, same indices.
- **Uniswap v3 wstETH/WETH 0.01% pool**: `0x109830a1aaad605bbf02a9dfa7b0b92ec2fb7daa` (CORRECTED from prior typo). Token0=wstETH (lower address), token1=WETH. Read `slot0().sqrtPriceX96`; `price_WETH_per_wstETH = (sqrtPriceX96 / 2^96)^2`. Also worth tracking the 0.05% pool `0xd340b57aacdd10f96fc1cf10e15921936f41e29c` (deeper liquidity).
- **Balancer wstETH/WETH** (MetaStablePool): `0x32296969ef14eb0c6d29669c550d4a0449130230`. **DO NOT use `getRate()` for spot price — it returns the BPT rate**, not wstETH/WETH. Use Vault `queryBatchSwap` for an exact 1 wstETH → WETH quote.

**wstETH ↔ stETH conversion**: `wstETH.stEthPerToken() → uint256` (1e18-scaled). To convert wstETH/WETH pool price to stETH/ETH ratio: `stETH_per_ETH = WETH_per_wstETH / (stEthPerToken / 1e18)`. Cache `stEthPerToken` daily.

**Formula**: `implied_redeem_apr = (1 − best_steth_price) / wait_days × 365`. Use the BEST (highest, closest to 1.0 from below) of the 4 DEX prices.

### 2.6 Pendle (Feature 2) — wstETH ONLY

**API** (REST only — SDK is archived):
- `GET https://api-v2.pendle.finance/core/v1/{chainId}/markets/active` — list active markets (chainId=1 mainnet, 42161 Arbitrum)
- `GET https://api-v2.pendle.finance/core/v1/{chainId}/markets/{address}` — single market detail

**Filter**: ONLY markets where `name == "wstETH"` (or underlying decode resolves to `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0`). Other LSTs/LRTs (weETH, ezETH, etc.) are explicitly excluded per scope.

**Response shape** (verified live, May 2026):
```json
{
  "name": "wstETH",
  "address": "0x34280882267ffa6383b363e278b027be083bbe3b",
  "expiry": "2027-12-30T00:00:00.000Z",
  "underlyingAsset": "1-0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0",
  "details": {
    "liquidity": 3693605.29,
    "impliedApy": 0.02382,
    "pendleApy": 0.00187,
    "feeRate": 0.0005
  }
}
```
- **All APYs are decimals** (0.02382 = 2.382%), not bps or percentage. Convert to bps via `× 10000` for DB storage.
- `underlyingAsset` format: `<chainId>-<address>`.

**Current market surface** (May 2026):
- Mainnet: 2 wstETH markets (`0x3428...3b` Dec 2027 $3.7M TVL; `0xcfd8...79` Jun 2026)
- Arbitrum: 1 wstETH market (`0xf784...5b` Jun 2026 $492K TVL — thin)
- Total: ~3 rows in the Pendle tab. Expected to be a small table.

**Rate limit**: 100 CU/min, 200k CU/week per IP (free, no auth). 60s polling well under limit.

**SDK note**: [`pendle-finance/pendle-sdk`](https://github.com/pendle-finance/pendle-sdk) is archived (Feb 2024). Use REST. [`pendle-finance/pendle-sdk-core-v2-public`](https://github.com/pendle-finance/pendle-sdk-core-v2-public) is for tx calldata generation only, not yield reads.

---

## 3. Formulas (canonical)

| Name | Formula | Notes |
|---|---|---|
| `funding_apr` | `rate × (24 / interval_hours) × 365` | Binance/Bybit/OKX usually 8 (verify per symbol); Hyperliquid = 1 (→ × 8760). |
| `basis_apr` | `(fut_price − spot_price) / spot_price × 365 / days_to_expiry` | Sign: positive = contango. |
| `implied_redeem_apr` | `(1 − steth_price) / wait_days × 365` | If `steth_price >= 1`, return 0 (no arb). |
| `net_loop_apr(L)` | `steth_apr × L − borrow_apr × (L − 1) − 0.0010` | 10 bps swap-fee constant. ETH-loop only. |
| `safe_leverage(LLTV)` | `1 / (1 − 0.8 × LLTV)` | 80% of max LTV as buffer. Use eMode LLTV where available. |
| `pendle_spread` | `pt_implied_apy − wsteth_variable_borrow_apr` | Positive = textbook arb. Both sides in decimal APY. |
| `cross_venue_funding_spread(a,b)` | `funding_apr(a) − funding_apr(b)` | Long b, short a captures the spread. |

All APR values stored as integer **basis points** (`apr_bps`) in DB. UI divides by 100 for display.

---

## 4. Schemas (full DDL)

```sql
-- 4.1 ticks: raw per-venue per-symbol observations
CREATE TABLE ticks (
  venue        text        NOT NULL,
  symbol       text        NOT NULL,
  kind         text        NOT NULL,  -- 'funding' | 'mark' | 'spot' | 'index' | 'futures'
  price        numeric,
  funding_rate numeric,                -- decimal, NOT annualized
  expiry       timestamptz,            -- nullable; set for delivery futures
  ts           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venue, symbol, kind, ts)
);
CREATE INDEX ticks_ts_idx ON ticks(ts DESC);

-- 4.2 opportunities: unified UI feed
CREATE TABLE opportunities (
  id           bigserial   PRIMARY KEY,
  category     text        NOT NULL,  -- 'funding' | 'basis' | 'peg' | 'pendle' | 'lend' | 'loop'
  pair         text        NOT NULL,  -- e.g. 'BTC', 'stETH', 'wstETH-ETH', 'wstETH-USDC'
  long_venue   text,                  -- nullable for category='peg' etc.
  short_venue  text,
  chain        text,                  -- nullable for CEX-only
  spread_bps   numeric,
  apr_bps      numeric     NOT NULL,
  detail       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  computed_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category, pair, long_venue, short_venue, chain)
);
CREATE INDEX opp_cat_apr_idx ON opportunities(category, apr_bps DESC);

-- 4.3 spread_hourly: sparkline rollup
CREATE TABLE spread_hourly (
  category     text        NOT NULL,
  pair         text        NOT NULL,
  venue_key    text        NOT NULL,
  hour         timestamptz NOT NULL,
  spread_bps_avg numeric,
  spread_bps_max numeric,
  PRIMARY KEY (category, pair, venue_key, hour)
);

-- 4.4 lend_rates: per-venue per-chain per-asset (covers ETH AND stables)
CREATE TABLE lend_rates (
  chain        text        NOT NULL,
  venue        text        NOT NULL,
  asset        text        NOT NULL,  -- 'WETH' | 'USDC' | 'USDT' | 'DAI' | 'GHO' | 'USDS' | 'crvUSD' | 'sUSDe' | 'wstETH'
  supply_apr_bps numeric,
  borrow_apr_bps numeric,
  ltv_bps      numeric,                -- base LTV in bps (this asset as collateral)
  llt_bps      numeric,                -- liquidation threshold
  emode        boolean     NOT NULL DEFAULT false,
  borrowable   boolean     NOT NULL DEFAULT true,
  total_supply_usd numeric,
  total_borrow_usd numeric,
  ts           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, venue, asset, emode, ts)
);

-- 4.5 pendle_markets (wstETH only)
CREATE TABLE pendle_markets (
  chain        text        NOT NULL,
  market_addr  text        NOT NULL,
  underlying   text        NOT NULL,  -- 'wstETH'
  expiry       timestamptz NOT NULL,
  pt_implied_apy_bps numeric NOT NULL,
  yt_floating_apy_bps numeric,
  liquidity_usd numeric,
  ts           timestamptz NOT NULL,
  PRIMARY KEY (chain, market_addr, ts)
);

-- 4.6 lido_queue
CREATE TABLE lido_queue (
  ts                 timestamptz NOT NULL PRIMARY KEY,
  unfinalized_steth  numeric     NOT NULL,
  last_request_id    bigint      NOT NULL,
  last_finalized_id  bigint      NOT NULL,
  est_wait_days      numeric     NOT NULL,
  bunker_mode        boolean     NOT NULL DEFAULT false,
  wait_source_type   text                            -- 'bunker' | 'vaultsBalance' | 'exitValidators' | etc.
);

-- 4.7 steth_apr
CREATE TABLE steth_apr (
  ts       timestamptz NOT NULL PRIMARY KEY,
  apr_bps  numeric     NOT NULL,
  source   text        NOT NULL    -- 'lido-api-sma' | 'lido-api-last' | 'on-chain-share-rate'
);

-- 4.8 dex_prices
CREATE TABLE dex_prices (
  chain    text        NOT NULL,
  dex      text        NOT NULL,    -- 'curve' | 'curve-ng' | 'uni-v3' | 'balancer'
  pool     text        NOT NULL,
  base     text        NOT NULL,    -- 'stETH' | 'wstETH'
  quote    text        NOT NULL,    -- 'ETH' | 'WETH'
  price    numeric     NOT NULL,    -- always normalized to stETH/ETH for peg calcs
  ts       timestamptz NOT NULL,
  PRIMARY KEY (chain, dex, pool, ts)
);

-- 4.9 quarterly_futures
CREATE TABLE quarterly_futures (
  venue      text        NOT NULL,
  symbol     text        NOT NULL,
  expiry     timestamptz NOT NULL,
  fut_price  numeric     NOT NULL,
  spot_price numeric     NOT NULL,
  ts         timestamptz NOT NULL,
  PRIMARY KEY (venue, symbol, ts)
);
```

---

## 5. File layout map

```
apps/worker/src/
├── index.ts                       # bootstrap: registers per-source intervals, graceful shutdown
├── chain/
│   └── clients.ts                 # viem clients per chain, multicall3 helper
├── db/
│   ├── client.ts                  # pg pool
│   └── migrations/                # 0001_init.sql, ...
├── adapters/
│   ├── cex/
│   │   ├── binance.ts             # pollFunding (+ fundingInfo cache), pollQuarterly (+ exchangeInfo cache)
│   │   ├── bybit.ts
│   │   ├── okx.ts                 # per-instrument funding loop, batch instruments
│   │   ├── hyperliquid.ts         # POST metaAndAssetCtxs; annualize × 8760
│   │   └── deribit.ts             # BTC/ETH only
│   ├── chain/
│   │   ├── curve-steth.ts         # get_dy(1, 0, 1e18)
│   │   ├── uni-v3-wsteth.ts       # slot0 + sqrtPriceX96 math, both fee tiers
│   │   ├── balancer-wsteth.ts     # queryBatchSwap, NOT getRate
│   │   ├── aave-v3.ts             # UiPoolDataProviderV3 + eMode bitmap reads (v3.2)
│   │   ├── morpho-blue.ts         # GraphQL with marketId (not uniqueKey)
│   │   ├── spark.ts               # mainnet only
│   │   └── compound-v3.ts         # per-market Comet reads
│   ├── lido/
│   │   ├── queue.ts               # WithdrawalQueueERC721 reads
│   │   ├── wait-time.ts           # wq-api.lido.fi/v2/request-time/calculate (whole ETH)
│   │   └── apr.ts                 # eth-api.lido.fi + on-chain share-rate fallback
│   ├── pendle/
│   │   └── markets.ts             # api-v2.pendle.finance, wstETH-only filter
│   └── defillama/
│       └── yields.ts              # /pools + /lendBorrow joined on pool UUID
├── engine/
│   ├── funding.ts
│   ├── basis.ts
│   ├── peg.ts
│   ├── pendle.ts
│   ├── lend.ts
│   ├── loop.ts                    # ETH-loop only
│   └── rollup.ts                  # spread_hourly maintenance
└── scripts/
    ├── db-ping.ts
    ├── rpc-ping.ts
    └── probe-*.ts                 # one per adapter, used by verification

apps/web/app/
├── layout.tsx                     # Topbar + UpdatedAgo
├── page.tsx                       # Hero card (Implied Redeem APR)
├── (tabs)/
│   ├── peg/page.tsx
│   ├── pendle/page.tsx
│   ├── funding/page.tsx
│   ├── basis/page.tsx
│   ├── lend/page.tsx
│   └── loops/page.tsx
├── components/
│   ├── OpportunityRow.tsx
│   ├── Sparkline.tsx
│   ├── Topbar.tsx
│   ├── UpdatedAgo.tsx
│   └── FilterBar.tsx
├── api/
│   ├── opportunities/route.ts     # GET ?cat=... ; 5s in-memory cache
│   └── sparkline/[category]/[pair]/route.ts
└── lib/
    ├── db.ts                      # read-only pg pool
    └── useOpportunities.ts        # SWR hook

packages/shared/src/
├── index.ts
├── types.ts
├── schemas.ts                     # zod
├── math.ts                        # all formulas from §3
├── math.test.ts
└── constants.ts                   # contract addrs, chain IDs, symbol whitelists
```

---

## 6. Constants (frozen)

### 6.1 Chains & env vars

| Name | chainId | RPC URL |
|---|---|---|
| mainnet | 1 | `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` |
| arbitrum | 42161 | `https://arb-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` |
| optimism | 10 | `https://opt-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` |
| base | 8453 | `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}` |

Env vars: `DATABASE_URL`, `ALCHEMY_KEY`, `PENDLE_API_BASE` (default `https://api-v2.pendle.finance/core`).

### 6.2 Mainnet contract addresses

| Contract | Address |
|---|---|
| Lido stETH | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` |
| Lido wstETH | `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` |
| Lido WithdrawalQueueERC721 (proxy) | `0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1` |
| Curve stETH/ETH pool (old) | `0xDC24316b9AE028F1497c275EB9192a3Ea0f67022` |
| Curve stETH-ng pool | `0x21E27a5E5513D6e65C4f830167390997aA84843a` |
| Uniswap v3 Quoter | `0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6` |
| Uni v3 wstETH/WETH 0.01% pool | `0x109830a1aaad605bbf02a9dfa7b0b92ec2fb7daa` |
| Uni v3 wstETH/WETH 0.05% pool | `0xd340b57aacdd10f96fc1cf10e15921936f41e29c` |
| Balancer wstETH/WETH MetaStable | `0x32296969ef14eb0c6d29669c550d4a0449130230` |
| Aave v3 Pool (mainnet) | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` |
| Spark Pool (mainnet) | `0xC13e21B648A5Ee794902342038FF3aDAB66BE987` |
| Compound v3 cWETHv3 (mainnet) | `0xA17581A9E3356d9A858b789D68B4d866e593aE94` |
| Chainlink ETH/USD (mainnet) | `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419` |
| Morpho Blue GraphQL | `https://blue-api.morpho.org/graphql` |

### 6.3 Aave v3 Pool addresses (other chains)

| Chain | Address |
|---|---|
| Arbitrum | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| Optimism | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| Base | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |

### 6.4 Compound v3 cWETHv3 addresses (other chains)

| Chain | Address |
|---|---|
| Arbitrum | `0x6f7D514bbD4aFf3BcD1140B7344b32f063dEe486` |
| Optimism | `0xE36A30D249f7761327fd973001A32010b521b6Fd` |
| Base | `0x46e6b214b524310239732D51387075E0e70970bf` |

### 6.5 Asset addresses (WETH, wstETH per chain)

| Asset | Mainnet | Arbitrum | Optimism | Base |
|---|---|---|---|---|
| WETH | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` | `0x82aF49447D8a07e3bd95BD0d56f35241523fBab1` | `0x4200000000000000000000000000000000000006` | `0x4200000000000000000000000000000000000006` |
| wstETH | `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` | `0x5979D7b546E38E414F7E9822514be443A4800529` | `0x1F32b1c2345538c0c6f582fCB022739c4A194Ebb` | `0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452` |

For stablecoin addresses, use [`bgd-labs/aave-address-book`](https://github.com/bgd-labs/aave-address-book) at integration time (avoids spec rot).

### 6.6 Symbol whitelist for funding/basis

Top-20 perps by 7-day volume (refresh manually each release):
`BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK, MATIC, DOT, LTC, BCH, NEAR, ATOM, ARB, OP, SUI, APT, TON`

### 6.7 Pendle markets to track

Resolved dynamically by `pendle/markets.ts` filtering for `name == "wstETH"` (or `underlyingAsset` decode = mainnet wstETH `0x7f39...`). NO weETH, NO ezETH, NO other LSTs/LRTs. Currently ~3 markets total across mainnet + Arbitrum.

### 6.8 Stablecoin asset whitelist (lending tab)

`USDC, USDT, DAI, GHO, USDS, crvUSD, sUSDe`

---

## 7. Verification recipes

### 7.1 Funding rate spot-check
```bash
curl -s "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT" | jq '.lastFundingRate'
docker run --rm postgres:16 psql "$DATABASE_URL" -c "SELECT funding_rate FROM ticks WHERE venue='binance' AND symbol='BTCUSDT' AND kind='funding' ORDER BY ts DESC LIMIT 1;"
# Values should match to 6 decimals.
```

### 7.2 Aave borrow rate spot-check
```bash
# Visit https://app.aave.com/reserve-overview/?underlyingAsset=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2&marketName=proto_mainnet_v3
docker run --rm postgres:16 psql "$DATABASE_URL" -c "SELECT borrow_apr_bps/100.0 FROM lend_rates WHERE chain='mainnet' AND venue='aave-v3' AND asset='WETH' ORDER BY ts DESC LIMIT 1;"
# Should match Aave UI variable borrow APY within 5 bps.
```

### 7.3 Pendle PT yield spot-check
```bash
curl -s "https://api-v2.pendle.finance/core/v1/1/markets/active" | jq '.[] | select(.name=="wstETH") | {addr: .address, apy: .details.impliedApy}'
docker run --rm postgres:16 psql "$DATABASE_URL" -c "SELECT pt_implied_apy_bps/100.0 FROM pendle_markets WHERE chain='mainnet' ORDER BY ts DESC LIMIT 5;"
```

### 7.4 Peg / queue spot-check
```bash
# Live queue size on-chain
cast call 0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1 "unfinalizedStETH()(uint256)" --rpc-url "https://eth-mainnet.g.alchemy.com/v2/$ALCHEMY_KEY"
# Live wait estimate for 1000 ETH
curl -s "https://wq-api.lido.fi/v2/request-time/calculate?amount=1000" | jq '.requestInfo'
# Live Curve price
cast call 0xDC24316b9AE028F1497c275EB9192a3Ea0f67022 "get_dy(int128,int128,uint256)(uint256)" 1 0 1000000000000000000 --rpc-url ...
```

### 7.5 Data freshness queries
```sql
SELECT category, MAX(computed_at) AS last_update, NOW() - MAX(computed_at) AS age
FROM opportunities GROUP BY category;
-- Healthy: age < 2 × cadence for that category.
```

---

## 8. Out of scope (do not implement)

**Hard exclusions (per scope tightening 2026-05-17):**
- **Other LSTs**: rETH, cbETH, frxETH, mETH, swETH, ETHx — none. wstETH only.
- **LRTs**: weETH, ezETH, rsETH, pufETH — none. (LRT premium tracking previously deferred from lane E.)
- **Pendle markets for non-wstETH underlying** — only wstETH PT/YT.

**Previously deferred (still out):**
- Cross-chain wstETH price arb (lane C)
- Liquidation auction monitoring (lane H)
- ETH ETF premium tracking (lane I)
- Order routing, execution, accounts, alerts
- Fee-adjusted APR (subtract taker fees + borrow cost adjustments beyond constants)
- Cross-tab navigation / deep-links
- **Stablecoin-extraction looping math** in Loops tab (Lending tab surfaces stable borrow rates; users compose manually for now)
