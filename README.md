# ArbiTrack

Cross-venue yield + funding + basis arbitrage scanner for ETH-correlated markets.
Polls 7 perp venues, 4 lending protocols, Pendle PT yields, Lido withdrawal queue,
and 4 DEX stETH/ETH prices; writes opportunities into Postgres; renders a Next.js
dashboard with live spreads and 24h sparklines.

## Stack

- **Worker** — `apps/worker`, Node 22 + tsx, polls every 10s, writes Postgres.
- **Web** — `apps/web`, Next.js 14 App Router, Server Components + SWR.
- **Shared** — `packages/shared`, types + zod schemas + math formulas + constants.
- **DB** — Postgres 14+ (Neon for prod, docker for local).
- **Tests** — vitest for parsers (`pnpm -F shared test`), Playwright e2e (`pnpm -F web test:e2e`).

## Setup

```bash
# 1. Install deps (requires pnpm 9.15+)
pnpm install

# 2. Create .env.local at repo root
cat > .env.local <<EOF
DATABASE_URL=postgresql://user:pass@host/db?sslmode=require
ALCHEMY_KEY=<your alchemy team key>
PENDLE_API_BASE=https://api-v2.pendle.finance/core
EOF

# 3. Migrate schema (creates 9 tables per SPEC §4)
pnpm db:migrate

# 4. Run worker (Ctrl-C to stop; default runs forever)
pnpm dev:worker

# 5. In another shell, run web
pnpm dev:web
# → open http://localhost:3000
```

## Local Postgres via Docker (no Neon)

```bash
docker run -d --name arbitrack-pg \
  -e POSTGRES_PASSWORD=arbitrack -e POSTGRES_USER=arbitrack -e POSTGRES_DB=arbitrack \
  -p 127.0.0.1:5433:5432 postgres:16
# Then DATABASE_URL=postgresql://arbitrack:arbitrack@127.0.0.1:5433/arbitrack
```

## Env variables

| Var | Required | Notes |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `ALCHEMY_KEY` | yes | Single team key works across mainnet/arb/op/base |
| `PENDLE_API_BASE` | no | Defaults to `https://api-v2.pendle.finance/core` |
| `RPC_URL_MAINNET` etc. | no | Override Alchemy per chain (4 vars) |
| `WORKER_RUN_DURATION_MS` | no | `0` (default) = forever; set to e.g. `30000` for verification runs |

## Tabs

| Route | What it shows |
|---|---|
| `/` | Hero with current **Implied Redeem APR** + Topbar (ETH spot, stETH/ETH, queue, best loop, ETH funding) |
| `/funding` | Cross-venue funding spreads (7 venues) |
| `/basis` | Quarterly futures basis (Binance, OKX, Deribit) |
| `/lend` | All borrow/supply rates across Aave/Spark/Compound/Morpho/DefiLlama |
| `/loops` | wstETH/ETH net loop APR per (venue, chain) with safe leverage + health buffer |
| `/peg` | Detail page — stETH/ETH DEX prices, queue size, wait time |
| `/pendle` | wstETH PT vs cheapest variable borrow spread |

## Verification recipes (SPEC §7)

```bash
# 1. Funding rate spot-check (should match to 6 dp)
curl -s "https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT" | jq '.lastFundingRate'
psql "$DATABASE_URL" -c "SELECT funding_rate FROM ticks WHERE venue='binance' AND symbol='BTCUSDT' ORDER BY ts DESC LIMIT 1;"

# 2. Aave WETH borrow rate (within 5 bps of app.aave.com)
psql "$DATABASE_URL" -c "SELECT borrow_apr_bps/100.0 FROM lend_rates WHERE chain='mainnet' AND venue='aave-v3' AND asset='WETH' ORDER BY ts DESC LIMIT 1;"

# 3. Pendle PT yield (within 10 bps of pendle.finance)
psql "$DATABASE_URL" -c "SELECT pt_implied_apy_bps/100.0 FROM pendle_markets ORDER BY ts DESC LIMIT 5;"
```

## Deploy

### Web → Vercel

```bash
# One-time: link the project
vercel link

# Set production secrets
vercel env add DATABASE_URL production
vercel env add ALCHEMY_KEY production

# Deploy
vercel --prod
```

`vercel.json` at repo root configures the build for the pnpm workspace.

### Worker → Fly.io

```bash
cd apps/worker

# One-time: create the app (uses fly.toml in this dir)
flyctl launch --no-deploy --copy-config --name arbitrack-worker

# Set secrets
flyctl secrets set DATABASE_URL=... ALCHEMY_KEY=...

# Deploy
flyctl deploy

# Watch logs
flyctl logs
```

256 MB VM is sufficient. Worker has no HTTP service — it's a long-running poll loop. SIGTERM exits gracefully.

## Caveats

- **Balancer wstETH/WETH MetaStablePool** (SPEC §6.2 pinned at `0x32296969…0230`) is effectively drained as of 2026-05 (~0.09 wstETH on-chain). The adapter still queries it for transparency but the value is excluded from the DEX spread check. Update SPEC when Balancer migrates wstETH liquidity to a live Composable Stable Pool.
- **Neon DNS** can resolve to IPv6 addresses that time out from IPv4-only egress paths. `apps/worker/src/env.ts` forces `ipv4first` to compensate.
- **Worker is single-process polling.** For higher cadence per venue, split into per-venue tasks with their own intervals (planned but not implemented).

## Project structure

```
apps/
├── web/                Next.js app
└── worker/             Polling worker + DB migrations + probe scripts
packages/
└── shared/             Types, zod schemas, math, constants — used by both apps
SPEC.md                 Frozen product + data contract
RALPH.md                Build-loop instructions for the Ralph Wiggum agent
PROGRESS.md             Task checklist (one task per line, ralph(<id>): <title>)
```
