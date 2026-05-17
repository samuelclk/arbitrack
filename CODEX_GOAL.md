# Codex Goal Prompt — ArbiTrack 3-hour autonomous build

Paste the block below into Codex (chatgpt.com/codex) on a fresh task pointed at this repo. Self-contained — Codex doesn't see prior conversation.

## How to launch

### Prerequisite — enable the experimental `/goal` feature

Either:
- Run `/experimental` in Codex CLI and toggle **goals** on, OR
- Add to `~/.codex/config.toml`:
  ```toml
  [features]
  goals = true
  ```

### Launch flow

1. Open Codex (CLI or chatgpt.com/codex) → New task → point at `samuelclk/arbitrack` main branch.
2. In Codex's session/task settings (NOT in the `/goal` command itself — `/goal` has no flags):
   - Set max runtime ≈ 3 hours
   - Allow network access (needed for CEX APIs, Alchemy, Pendle, DefiLlama, Lido)
   - Set environment secrets: `DATABASE_URL`, `ALCHEMY_KEY` (without these, foundation tasks past 0.10 will be marked `[!]` and skipped)
3. Type the goal command, pasting the block below as the `<objective>`:
   ```
   /goal <paste the entire prompt block below as one continuous objective string>
   ```
4. Codex starts working. Use `/goal pause`, `/goal resume`, or `/goal clear` to control mid-run.
5. To monitor: `/goal` (no args) prints the current objective + state.

### Codex `/goal` flag reference (verified against official docs)

The `/goal` command takes NO flags. Only 5 subcommands exist:
- `/goal <objective>` — set
- `/goal` — view
- `/goal pause` / `/goal resume` / `/goal clear` — state control

Time budget, iteration count, network access, and secrets are configured at the Codex session level, not via `/goal` parameters.

## Expected outcome at 3h

Phases 0–5 complete, Phase 6 partial, Phases 7–8 untouched. Working dashboard at `localhost:3000` with 6 of 7 tabs live and headline Implied Redeem APR working.

---

## The goal prompt

```
/goal Build ArbiTrack — a crypto arbitrage/yield-strategy dashboard for wstETH-as-collateral strategies. Work autonomously for the full 3-hour budget.

# Authoritative references (read these FIRST, in order)
1. /SPEC.md — frozen technical spec: architecture, data sources (verified live endpoints), formulas, full DDL, contract addresses, verification recipes. DO NOT EDIT.
2. /PROGRESS.md — work queue of 55 atomic tasks across 8 phases. Each task lists files to touch, dependencies, and a verification command. You will mark these complete as you go.
3. /RALPH.md — per-iteration operating rules. Follow them. DO NOT EDIT.

You inherit the spec's scope tightening: wstETH-only collateral, debt in ETH or stablecoins. NO other LSTs/LRTs. NO stable-extraction loops. See SPEC §8.

# Environment setup (do this once, before any task)
1. Read .env.example. The repo's .env.local is gitignored and not present in CI/Codex. You MUST either:
   (a) Receive these via Codex environment secrets and write to .env.local, or
   (b) If secrets are unavailable, write the following placeholders to .env.local AND mark dependent tasks `[!] BLOCKED: missing env var <NAME>`:
     - DATABASE_URL (Postgres 14+ connection string, sslmode=require)
     - ALCHEMY_KEY (single team key, works across mainnet/arbitrum/optimism/base)
     - PENDLE_API_BASE=https://api-v2.pendle.finance/core
2. Run `corepack enable pnpm`. Confirm `pnpm -v` >= 10.
3. Install Playwright for browser testing: `pnpm add -D -w playwright @playwright/test && pnpm exec playwright install chromium`.
4. Configure git: `git config user.email "codex@arbitrack.local" && git config user.name "Codex"`. Do NOT add Co-Authored-By trailers.
5. Smoke-test foundation:
   - `curl -sf https://eth-mainnet.g.alchemy.com/v2/$ALCHEMY_KEY -X POST -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber"}'` returns a result
   - Postgres connection works via `pnpm dlx postgres` or by writing a tiny Node script
   If either fails, halt and document the failure.

# Per-iteration loop (follow exactly — encoded in RALPH.md)
1. Read PROGRESS.md top-to-bottom.
2. Find first task with `[ ]` checkbox AND all listed dependencies marked `[x]`.
3. If no eligible task: print "RALPH DONE" and exit.
4. Read SPEC.md sections referenced in the task (e.g. "SPEC §3.4", "SPEC §6.2").
5. Implement. Constraints:
   - Touch only files listed in the task (or files clearly implied — a new adapter implies its own probe script).
   - DO NOT refactor unrelated code.
   - DO NOT add features beyond the task description.
   - Match existing style. Use existing helpers (getChainClient, pgPool, shared/math) — don't duplicate.
6. Run the task's verification command exactly as written.
7. On pass:
   - Flip `[ ]` → `[x]` in PROGRESS.md for this task only.
   - `git add -A && git commit -m "ralph(<task-id>): <title>"`.
8. On fail: one retry with a targeted fix. If still failing:
   - Flip `[ ]` → `[!]`, append `BLOCKED: <one-line error>` under the task line.
   - Commit with `ralph(<task-id>): blocked`.
   - Continue to the NEXT eligible task — do not halt.
9. Repeat until time runs out or "RALPH DONE".

# Hard rules
- NEVER edit SPEC.md or RALPH.md.
- NEVER edit PROGRESS.md except: (a) flip task state, (b) append BLOCKED notes.
- NEVER use --no-verify, --no-gpg-sign, git push --force, git reset --hard, or rm -rf as shortcuts.
- NEVER invent task IDs or add new tasks.
- If a task is ambiguous, mark `[!] BLOCKED: ambiguous — needs human` and move on.

# Testing requirements (additive — must accompany implementation)

## Unit tests (vitest)
- packages/shared MUST have vitest config + tests for every formula in math.ts (Task 0.6 already specifies this).
- Every adapter (apps/worker/src/adapters/**/*.ts) MUST have a probe script in apps/worker/src/scripts/probe-<name>.ts that fetches live data and prints ≥10 rows. PROGRESS.md tasks already mandate these.
- Engine modules (engine/*.ts) — write at least one vitest case per engine that exercises the spread/derivation logic against a hand-crafted fixture (NO live network in unit tests). Add these alongside the engine task even though PROGRESS.md doesn't explicitly list them.
- Run `pnpm -r test` after each engine task to ensure no regression.

## Browser tests (Playwright, detached headless)
After Phase 1 (funding tab) ships:
- Add a smoke test in apps/web/tests/smoke.spec.ts that:
  1. Starts the dev server in background: `pnpm dev:web &` (kill on teardown)
  2. Waits for http://localhost:3000 to return 200 (poll up to 30s)
  3. Navigates to /funding via Playwright (chromium, headless)
  4. Asserts ≥1 row renders in the opportunity table (expect a [data-testid="opp-row"] element)
  5. Asserts the "Updated Xs ago" counter is present and advances within 15s
  6. Saves a screenshot to apps/web/tests/screenshots/<tab>.png for each tab as it's built
- Repeat the smoke test pattern for /basis, /lend, /loops, /peg, /pendle as each tab lands.
- Add a Playwright config (apps/web/playwright.config.ts) with timeout=60s per test, retries=1.
- Run `pnpm -F web exec playwright test` after every tab task.
- Treat Playwright failures the same as task verification failures (mark `[!]` and continue).

## Detached browser pattern (important)
Codex's environment may not have a display server. Run Playwright with:
```
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
```
If chromium binary is missing after install, re-run `pnpm exec playwright install chromium` and retry. Do not fall back to non-Playwright methods.

# Build order — follow PROGRESS.md phases strictly
Phase 0 (Foundation, 12 tasks) → Phase 1 (Funding, 11 tasks, includes 3 new DEX adapters: Lighter/Aster/GRVT) → Phase 2 (Basis) → Phase 3 (Lending) → Phase 4 (Loops) → Phase 5 (Peg, headline) → Phase 6 (Pendle) → Phase 7 (Polish) → Phase 8 (Deploy, SKIP unless time remains — local-only is fine).

Stretch goal for 3-hour budget: complete Phases 0–5 with passing unit + browser tests. Phases 6–8 are bonus.

# Time discipline
- Set internal milestones: Phase 0 done by 00:30, Phase 1 by 01:00, Phase 2 by 01:20, Phase 3 by 02:00, Phase 4 by 02:15, Phase 5 by 03:00.
- If you fall behind, prioritize finishing whole phases (the verification + browser tests for finished phases) over starting new phases.
- Do not skip the verification step for any task — that's worse than skipping the task.

# Special handling per data source (gotchas from spec research, surface in adapter code)
- Hyperliquid: annualize × 8760 (hourly), NOT × 1095. Common bug.
- Binance: funding interval not always 8h — read /fapi/v1/fundingInfo per symbol.
- GRVT: funding_rate scale is ambiguous (sample `0.0096`). Probe one cycle, compare APR to GRVT UI, hardcode the correct multiplier in adapter with a code comment explaining the empirical choice.
- Lido withdrawals API: amount is whole ETH, NOT wei. Endpoint is /v2/request-time/calculate.
- Lido stETH APR: use eth-api.lido.fi (the previously documented stake.lido.fi/api/sma-steth-apr is dead).
- DefiLlama: TWO endpoints (/pools + /lendBorrow) must be joined on pool UUID.
- Morpho Blue: use marketId (uniqueKey deprecated).
- Uniswap v3 wstETH/WETH 0.01% pool: 0x109830a1aaad605bbf02a9dfa7b0b92ec2fb7daa (don't trust any typo'd version).
- Curve stETH/ETH indices: i=0 ETH, i=1 stETH.
- Balancer wstETH/WETH MetaStable: DO NOT use getRate() for spot — use Vault queryBatchSwap.
- Pendle: REST only (SDK archived). impliedApy is decimal, not bps. wstETH-only filter per scope.

# Final report (when you stop or hit RALPH DONE)
Write a final commit `ralph: session summary` updating no files but with a commit message containing:
- Tasks completed (count + IDs)
- Tasks BLOCKED (IDs + reasons)
- Unit test pass rate
- Browser test pass rate
- Recommended next 5 tasks for the next session

Begin now. Read SPEC.md, PROGRESS.md, RALPH.md, then start at task 0.1.
```
