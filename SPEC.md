# ArbiTrack — Technical Spec (frozen reference for Ralph loop)

> **DO NOT EDIT during the Ralph loop.** This file is the immutable reference. All implementation details, addresses, endpoints, formulas, and schemas live here. Tasks in PROGRESS.md reference sections of this file by number (e.g. "SPEC §3.4").

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
| Lending rates (Aave/Morpho/Spark) | 60s | Rates change slowly |
| Pendle PT yields | 60s | Same |
| Lido queue length | 5min | Validator exit dynamics are slow |
| Lido stETH APR | 1h | Rebases daily |
| Hourly rollup (spread_hourly) | 5min | Incremental aggregate maintenance |

### 1.4 Database — Neon Postgres

- Single Neon project, free tier (0.5 GB, autoscaling compute).
- No Timescale. Plain `timestamptz`-indexed tables.
- `ticks` is monthly-partitioned via `pg_partman` if volume exceeds 1 GB; defer to operational need.
- Migrations are plain SQL files in `apps/worker/db/migrations/`, applied by `pnpm db:migrate`.

### 1.5 RPC strategy

- **viem** for all RPC. `multicall3` batches per-chain reads into single HTTP calls.
- One Alchemy app per chain (mainnet, Arbitrum, Optimism, Base).
- Free-tier compute units (~300M/mo per app) are sufficient given multicall + 30–60s cadences.
- All RPC calls flow through a single `getChainClient(chainId)` helper in `apps/worker/src/chain/clients.ts`.

---

## 2. Data sources (per feature)

### 2.1 Funding (Feature 3)

| Venue | Endpoint | Method | Funding interval | Notes |
|---|---|---|---|---|
| Binance | `https://fapi.binance.com/fapi/v1/premiumIndex` | GET | 8h | Returns all USDT-M perps in one call. Field: `lastFundingRate`. |
| Bybit | `https://api.bybit.com/v5/market/tickers?category=linear` | GET | 8h | Funding in tickers response. Field: `fundingRate`. |
| OKX | `https://www.okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP` | GET | 8h | Per-instrument; loop or use `instType=SWAP` variant. |
| Hyperliquid | `https://api.hyperliquid.xyz/info` | POST `{"type":"metaAndAssetCtxs"}` | 1h | All perps in one call. `funding` is hourly rate as decimal. |

**Reference impl**: [`jose-donato/crypto-futures-arbitrage-scanner`](https://github.com/jose-donato/crypto-futures-arbitrage-scanner) — Go, multi-venue.

**Cross-check UIs**: [coinglass.com/FundingRate](https://www.coinglass.com/FundingRate), [coinalyze.net](https://coinalyze.net).

### 2.2 Basis / Quarterly futures (Feature 4)

| Venue | Endpoint | Notes |
|---|---|---|
| Binance | `https://dapi.binance.com/dapi/v1/ticker/price` | COIN-M delivery (e.g. `BTCUSD_240628`). Spot via `api.binance.com/api/v3/ticker/price`. |
| OKX | `https://www.okx.com/api/v5/market/tickers?instType=FUTURES` | Delivery contracts; expiry parsed from `instId` or fetched via `/api/v5/public/instruments?instType=FUTURES`. |
| Deribit | `https://www.deribit.com/api/v2/public/get_instruments?currency=BTC&kind=future&expired=false` then `/public/ticker?instrument_name=...` | BTC/ETH/SOL only. Expiry in `expiration_timestamp` (ms). |

### 2.3 Lending (Feature 5)

**Primary source**: [DefiLlama Yields API](https://yields.llama.fi/pools) — `GET https://yields.llama.fi/pools` returns ALL pools across protocols/chains in one ~5MB response. Filter client-side:

```ts
pools.filter(p =>
  ['aave-v3', 'morpho-blue', 'spark', 'compound-v3'].includes(p.project) &&
  ['WETH', 'wstETH', 'ETH'].includes(p.symbol)
)
```

Fields: `apy`, `apyBase`, `apyBaseBorrow`, `totalSupplyUsd`, `totalBorrowUsd`, `ltv`, `chain`.

**On-chain top-up** (for LLTV, e-mode, params DefiLlama may not surface):
- **Aave v3 Pool** per chain — `getReserveData(asset)` returns rates in RAY; `getConfiguration(asset)` packs LTV/LT/eMode in a uint256 bitmap (see Aave v3 docs §Reserve Configuration).
- **Morpho Blue** — read markets via subgraph `https://blue-api.morpho.org/graphql`; query schema includes `lltv`, `borrowApy`, `supplyApy`.
- **Spark** — Aave v3 fork; same ABI, different addresses.
- **Compound v3** — `Comet.getSupplyRate(utilization)` + `getBorrowRate(utilization)`; per-second rates, multiply by `seconds_per_year`.

### 2.4 Looping (Feature 6)

**stETH APR**:
- **Lido Stats API**: `GET https://stake.lido.fi/api/sma-steth-apr` — 7-day SMA, JSON `{ "smaApr": 3.21 }` shape.
- **On-chain canonical**: `Lido.getPooledEthByShares(1e18)` delta over 24h. Lido address: `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`.

**Looping math**:
- Inputs: `stETH_apr`, per-(venue,chain) ETH borrow APR, per-(venue,chain) wstETH LLTV.
- `safe_leverage = 1 / (1 − 0.8 × LLTV)` (uses 80% of max LTV as safety buffer).
- `net_apr(L) = stETH_apr × L − borrow_apr × (L − 1) − 0.0010` (10 bps round-trip swap fee assumption).

**Reference**:
- [Index Coop wstETH15x](https://www.indexcoop.com/blog/introducing-smart-loops-wsteth15x) — productized 15x loop on Morpho.
- [Summer.fi](https://summer.fi) — multi-protocol multiply UI.

### 2.5 Peg & Withdrawals (Feature 1, headline)

**Lido withdrawal queue** (on-chain reads):
- **WithdrawalQueueERC721**: `0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1`
- `unfinalizedStETH()` → uint256 (stETH in queue, 18 dec)
- `getLastRequestId()` and `getLastFinalizedRequestId()` → queue tail position

**Lido withdrawals-api** (wait-time estimate):
- Source: [`lidofinance/withdrawals-api`](https://github.com/lidofinance/withdrawals-api/tree/develop)
- Endpoint: `GET https://wq-api.lido.fi/v2/request-time?amount=<wei>` returns `{ requestInfo: { finalizationIn: <ms>, type: 'bunker' | 'normal' } }`
- Accuracy reference: [asatzger.github.io/lido-api-accuracy](https://asatzger.github.io/lido-api-accuracy/)

**DEX price sources** (mainnet):
- **Curve stETH/ETH (old pool)**: `0xDC24316b9AE028F1497c275EB9192a3Ea0f67022` — call `get_dy(1, 0, 1e18)`.
- **Curve stETH-ng (new pool)**: `0x21E27a5E5513D6e65C4f830167390997aA84843a` — same ABI.
- **Uniswap v3 wstETH/WETH 0.01%**: pool `0x109830a1aaad605bbf02a9dfa7b0b92319c70b2c` — use Quoter `quoteExactInputSingle(wstETH, WETH, 100, 1e18, 0)`, then convert via wstETH→stETH rate.
- **Balancer wstETH/WETH stable pool**: `0x32296969ef14eb0c6d29669c550d4a0449130230` — `getRate()` or via SOR.

**Formula**: `implied_redeem_apr = (1 − best_steth_price) / wait_days × 365`.

### 2.6 Pendle (Feature 2)

**API**: [`api-v2.pendle.finance`](https://api-v2.pendle.finance/core/docs)
- `GET https://api-v2.pendle.finance/core/v1/{chainId}/markets/active` — list active markets per chain (chainId=1 for mainnet, 42161 Arbitrum, etc.)
- `GET https://api-v2.pendle.finance/core/v1/{chainId}/markets/{address}` — single market detail incl. `impliedApy`, `ptDiscount`, `ytFloatingApy`, `expiry`.

Filter to markets whose underlying is wstETH, weETH, or ezETH.

**SDK fallback**: [`pendle-finance/pendle-sdk`](https://github.com/pendle-finance/pendle-sdk) (TypeScript), or [`obsh-onchain/pendle-yield`](https://github.com/obsh-onchain/pendle-yield) (Python ref).

---

## 3. Formulas (canonical)

| Name | Formula | Notes |
|---|---|---|
| `funding_apr` | `rate × (24 / interval_hours) × 365` | Binance/Bybit/OKX interval=8; Hyperliquid=1. |
| `basis_apr` | `(fut_price − spot_price) / spot_price × 365 / days_to_expiry` | Sign: positive = contango. |
| `implied_redeem_apr` | `(1 − steth_price) / wait_days × 365` | If `steth_price >= 1`, return 0 (no arb). |
| `net_loop_apr(L)` | `steth_apr × L − borrow_apr × (L − 1) − 0.0010` | 10 bps swap-fee constant. |
| `safe_leverage(LLTV)` | `1 / (1 − 0.8 × LLTV)` | 80% of max LTV as buffer. |
| `pendle_spread` | `pt_implied_apy − wsteth_variable_borrow_apr` | Positive = textbook arb. |
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
  pair         text        NOT NULL,  -- e.g. 'BTC', 'stETH', 'wstETH-ETH'
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
  venue_key    text        NOT NULL,  -- 'long|short' or 'chain|venue'
  hour         timestamptz NOT NULL,
  spread_bps_avg numeric,
  spread_bps_max numeric,
  PRIMARY KEY (category, pair, venue_key, hour)
);

-- 4.4 lend_rates: per-venue per-chain per-asset
CREATE TABLE lend_rates (
  chain        text        NOT NULL,
  venue        text        NOT NULL,
  asset        text        NOT NULL,
  supply_apr_bps numeric,
  borrow_apr_bps numeric,
  ltv_bps      numeric,                -- max LTV in bps
  llt_bps      numeric,                -- liquidation threshold
  emode        boolean     NOT NULL DEFAULT false,
  ts           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chain, venue, asset, emode, ts)
);

-- 4.5 pendle_markets
CREATE TABLE pendle_markets (
  chain        text        NOT NULL,
  market_addr  text        NOT NULL,
  underlying   text        NOT NULL,
  expiry       timestamptz NOT NULL,
  pt_implied_apy_bps numeric NOT NULL,
  yt_floating_apy_bps numeric,
  ts           timestamptz NOT NULL,
  PRIMARY KEY (chain, market_addr, ts)
);

-- 4.6 lido_queue
CREATE TABLE lido_queue (
  ts                 timestamptz NOT NULL PRIMARY KEY,
  unfinalized_steth  numeric     NOT NULL,
  last_request_id    bigint      NOT NULL,
  last_finalized_id  bigint      NOT NULL,
  est_wait_days      numeric     NOT NULL
);

-- 4.7 steth_apr
CREATE TABLE steth_apr (
  ts       timestamptz NOT NULL PRIMARY KEY,
  apr_bps  numeric     NOT NULL,
  source   text        NOT NULL    -- 'lido-api' | 'on-chain-share-rate'
);

-- 4.8 dex_prices
CREATE TABLE dex_prices (
  chain    text        NOT NULL,
  dex      text        NOT NULL,    -- 'curve' | 'uni-v3' | 'balancer'
  pool     text        NOT NULL,
  base     text        NOT NULL,    -- 'stETH' | 'wstETH'
  quote    text        NOT NULL,    -- 'ETH' | 'WETH'
  price    numeric     NOT NULL,
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
│   │   ├── binance.ts             # pollFunding, pollQuarterly
│   │   ├── bybit.ts
│   │   ├── okx.ts
│   │   ├── hyperliquid.ts
│   │   └── deribit.ts
│   ├── chain/
│   │   ├── curve-steth.ts
│   │   ├── uni-v3-wsteth.ts
│   │   ├── balancer-wsteth.ts
│   │   ├── aave-v3.ts             # reserves + LLTV per chain
│   │   ├── morpho-blue.ts         # subgraph
│   │   ├── spark.ts
│   │   └── compound-v3.ts
│   ├── lido/
│   │   ├── queue.ts               # WithdrawalQueueERC721 reads
│   │   ├── wait-time.ts           # wq-api.lido.fi
│   │   └── apr.ts                 # stake.lido.fi/api + on-chain fallback
│   ├── pendle/
│   │   └── markets.ts             # api-v2.pendle.finance
│   └── defillama/
│       └── yields.ts              # yields.llama.fi/pools
├── engine/
│   ├── funding.ts
│   ├── basis.ts
│   ├── peg.ts
│   ├── pendle.ts
│   ├── lend.ts
│   ├── loop.ts
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
├── index.ts                       # barrel
├── types.ts
├── schemas.ts                     # zod
├── math.ts                        # all formulas from §3
├── math.test.ts
└── constants.ts                   # contract addrs, chain IDs, symbol whitelist
```

---

## 6. Constants (frozen)

### 6.1 Chains

| Name | chainId | Env var for RPC URL |
|---|---|---|
| mainnet | 1 | `ALCHEMY_KEY_MAINNET` (constructed as `https://eth-mainnet.g.alchemy.com/v2/${key}`) |
| arbitrum | 42161 | `ALCHEMY_KEY_ARB` |
| optimism | 10 | `ALCHEMY_KEY_OP` |
| base | 8453 | `ALCHEMY_KEY_BASE` |

### 6.2 Mainnet contract addresses

| Contract | Address |
|---|---|
| Lido stETH | `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84` |
| Lido wstETH | `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0` |
| Lido WithdrawalQueueERC721 | `0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B1` |
| Curve stETH pool (old) | `0xDC24316b9AE028F1497c275EB9192a3Ea0f67022` |
| Curve stETH-ng pool | `0x21E27a5E5513D6e65C4f830167390997aA84843a` |
| Uniswap v3 Quoter | `0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6` |
| Uni v3 wstETH/WETH 0.01% pool | `0x109830a1aaad605bbf02a9dfa7b0b92319c70b2c` |
| Balancer wstETH/WETH stable | `0x32296969ef14eb0c6d29669c550d4a0449130230` |
| Aave v3 Pool (mainnet) | `0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2` |
| Chainlink ETH/USD (mainnet) | `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419` |

### 6.3 Aave v3 Pool addresses (other chains)

| Chain | Address |
|---|---|
| Arbitrum | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| Optimism | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| Base | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |

### 6.4 Symbol whitelist for funding/basis

Top-20 perps by 7-day volume (refresh manually each release):
`BTC, ETH, SOL, BNB, XRP, DOGE, ADA, AVAX, LINK, MATIC, DOT, LTC, BCH, NEAR, ATOM, ARB, OP, SUI, APT, TON`

### 6.5 Pendle markets to track (initial whitelist)

Resolved dynamically by `pendle/markets.ts` filtering for `underlyingAsset` ∈ `{wstETH, weETH, ezETH}`. No hardcoded addresses needed.

---

## 7. Verification recipes

### 7.1 Funding rate spot-check
```bash
# Compare worker output for BTCUSDT funding against Binance UI
curl -s "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT" | jq '.lastFundingRate'
# Then check the row in DB:
psql "$DATABASE_URL" -c "SELECT funding_rate FROM ticks WHERE venue='binance' AND symbol='BTCUSDT' AND kind='funding' ORDER BY ts DESC LIMIT 1;"
# Values should match to 6 decimals.
```

### 7.2 Aave borrow rate spot-check
```bash
# Compare worker output against app.aave.com
# Visit https://app.aave.com/reserve-overview/?underlyingAsset=0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2&marketName=proto_mainnet_v3
# Then:
psql "$DATABASE_URL" -c "SELECT borrow_apr_bps/100.0 FROM lend_rates WHERE chain='mainnet' AND venue='aave-v3' AND asset='WETH' ORDER BY ts DESC LIMIT 1;"
# Should match Aave UI variable borrow APY within 5 bps.
```

### 7.3 Pendle PT yield spot-check
```bash
# Pick a wstETH market from pendle.finance UI, note its implied APY.
curl -s "https://api-v2.pendle.finance/core/v1/1/markets/active" | jq '.[] | select(.underlyingAsset.symbol=="wstETH") | {addr: .address, apy: .impliedApy}'
# Compare to DB:
psql "$DATABASE_URL" -c "SELECT pt_implied_apy_bps/100.0 FROM pendle_markets WHERE chain='mainnet' ORDER BY ts DESC LIMIT 5;"
```

### 7.4 Data freshness queries
```sql
-- Per-category freshness:
SELECT category, MAX(computed_at) AS last_update,
       NOW() - MAX(computed_at) AS age
FROM opportunities GROUP BY category;
-- Healthy: age < 2 × cadence for that category.
```

---

## 8. Out of scope (do not implement)

- Cross-chain wstETH price arb (lane C from brainstorm)
- LRT premium tracking (lane E)
- Liquidation auction monitoring (lane H)
- ETH ETF premium tracking (lane I)
- Order routing, execution, accounts, alerts, fee-adjusted APR
- Cross-tab navigation/deep-links between rows (Phase 7+ wishlist)
