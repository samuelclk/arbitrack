# Codex Goal Prompt — ArbiTrack 3-hour autonomous build (v2)

Self-contained `/goal` prompt for Codex (chatgpt.com/codex or Codex CLI). Codex doesn't see prior conversation — the prompt below is everything it knows beyond the repo files.

## Prerequisites

The `/goal` command is **experimental** and disabled by default. Enable one of:
- Run `/experimental` in Codex CLI and toggle **goals** on, OR
- Add to `~/.codex/config.toml`:
  ```toml
  [features]
  goals = true
  ```

## Launch command (v2)

```
/goal <paste the entire prompt block in the next section as one continuous objective string>
```

The `/goal` command takes **NO flags**. Only 5 subcommands exist:
- `/goal <objective>` — set
- `/goal` (no args) — view current
- `/goal pause` — pause
- `/goal resume` — resume
- `/goal clear` — clear

Time budget, max iterations, network access, and environment secrets are configured at the **Codex session/task level** (the sidebar settings when you create the task), NOT via `/goal` parameters.

## Session-level settings to apply before launch

| Setting | Value |
|---|---|
| Repo | `samuelclk/arbitrack` (main branch) |
| Max runtime | ~3 hours |
| Network access | **enabled** (needed for CEX APIs, Alchemy, Pendle, DefiLlama, Lido) |
| Environment secrets | `DATABASE_URL`, `ALCHEMY_KEY` |

Without the secrets, foundation tasks past 0.10 will be marked `[!] BLOCKED` and skipped — Codex will still complete what it can.

## Expected outcome at 3h

Phases 0–5 complete with passing unit + browser tests. Phase 6 partial. Phases 7–8 untouched. Working dashboard at `localhost:3000` with 6 of 7 tabs rendering and the headline Implied Redeem APR working.

---

## v2 goal prompt (copy this entire block as the `<objective>`)

```
Build ArbiTrack — a crypto arbitrage/yield-strategy dashboard for wstETH-as-collateral strategies. Work autonomously for the full session budget.

# Authoritative references (read these FIRST, in order)
1. /SPEC.md — frozen technical spec: architecture, data sources with verified live endpoints, formulas, full DDL, contract addresses, verification recipes. DO NOT EDIT.
2. /PROGRESS.md — work queue of 55 atomic tasks across 8 phases. Each task lists files to touch, dependencies, and a verification command.
3. /RALPH.md — per-iteration operating rules. Follow them. DO NOT EDIT.

Inherit the spec's scope: wstETH-only collateral, debt in ETH or stablecoins. NO other LSTs/LRTs. NO stable-extraction loops. See SPEC §8.

# One-time setup before any task
1. If env secrets DATABASE_URL and ALCHEMY_KEY are not present in your environment, write placeholders to .env.local and mark dependent tasks [!] BLOCKED: missing env var <NAME>.
2. `corepack enable pnpm` — confirm pnpm 10+.
3. `pnpm add -D -w playwright @playwright/test && pnpm exec playwright install chromium` for browser tests.
4. `git config user.email "codex@arbitrack.local" && git config user.name "Codex"`. No Co-Authored-By trailers.
5. Smoke-test: curl Alchemy mainnet eth_blockNumber, ping Postgres. Halt if either fails.

# Per-iteration loop (encoded in RALPH.md)
1. Read PROGRESS.md top-to-bottom.
2. Find first task with [ ] AND all deps marked [x]. If none: print "RALPH DONE" and exit.
3. Read SPEC.md sections referenced in the task.
4. Implement. Constraints: touch only listed files, no refactors, no scope creep, match existing style, use existing helpers (getChainClient, pgPool, shared/math).
5. Run the task's verification command exactly as written.
6. On pass: flip [ ] → [x] in PROGRESS.md, commit "ralph(<id>): <title>".
7. On fail: one retry with targeted fix. If still failing: flip [ ] → [!], append "BLOCKED: <one-line error>", commit "ralph(<id>): blocked", continue to next eligible task — do not halt.
8. Repeat until time runs out or "RALPH DONE".

# Hard rules
- NEVER edit SPEC.md or RALPH.md.
- NEVER edit PROGRESS.md except: (a) flip task state, (b) append BLOCKED notes.
- NEVER use --no-verify, --no-gpg-sign, git push --force, git reset --hard, or rm -rf as shortcuts.
- NEVER invent task IDs or add new tasks.
- Ambiguous task: mark [!] BLOCKED: ambiguous — needs human, move on.

# Testing requirements (ADDITIVE — every implementation task ships with tests)

## Unit tests (vitest)
- packages/shared math.test.ts covers every formula in math.ts (task 0.6 mandates this).
- Every adapter has a probe script in apps/worker/src/scripts/probe-<name>.ts that fetches live and prints ≥10 rows (PROGRESS.md tasks mandate these).
- Every engine module gets at least one vitest case using a hand-crafted fixture (no live network). Add alongside the engine task even if PROGRESS.md doesn't explicitly list it.
- Run `pnpm -r test` after each engine task; no regressions.

## Browser tests (Playwright, detached headless chromium)
After Phase 1 (funding tab) ships, add apps/web/tests/smoke.spec.ts that:
- Starts dev server in background: `pnpm dev:web &` (kill on teardown)
- Waits for http://localhost:3000 to return 200 (poll up to 30s)
- Navigates to /funding via chromium headless: `chromium.launch({ headless: true, args: ['--no-sandbox'] })`
- Asserts ≥1 [data-testid="opp-row"] element renders
- Asserts the "Updated Xs ago" counter advances within 15s
- Saves screenshot to apps/web/tests/screenshots/<tab>.png
Repeat for /basis, /lend, /loops, /peg, /pendle as each tab lands.
Config: apps/web/playwright.config.ts with timeout=60s, retries=1.
Run `pnpm -F web exec playwright test` after every tab task.
Playwright failures → mark task [!], continue.

# Build order (strict — follow PROGRESS.md phases)
Phase 0 (Foundation, 12) → Phase 1 (Funding, 11 including DEX adapters Lighter/Aster/GRVT) → Phase 2 (Basis, 5) → Phase 3 (Lending, 6) → Phase 4 (Loops, 3) → Phase 5 (Peg, 6, headline) → Phase 6 (Pendle, 3) → Phase 7 (Polish, 5) → Phase 8 (Deploy, SKIP unless time remains).

Stretch goal at 3h: Phases 0–5 complete with passing tests.

# Time milestones (3-hour budget)
00:30 — Phase 0 done | 01:00 — Phase 1 done | 01:20 — Phase 2 done | 02:00 — Phase 3 done | 02:15 — Phase 4 done | 03:00 — Phase 5 done

If behind: finish whole phases (verification + browser tests) over starting new ones. NEVER skip verification.

# Per-source gotchas (surface in adapter code)
- Hyperliquid: annualize × 8760 (hourly), NOT × 1095.
- Binance funding: interval not always 8h — read /fapi/v1/fundingInfo per symbol.
- GRVT: funding_rate scale is ambiguous (sample 0.0096). Probe one cycle, compare APR to GRVT UI, hardcode the correct multiplier with a code comment explaining the empirical choice.
- Lido withdrawals API: amount is whole ETH, NOT wei. Endpoint /v2/request-time/calculate.
- Lido stETH APR: use eth-api.lido.fi (stake.lido.fi/api/sma-steth-apr is dead).
- DefiLlama: TWO endpoints (/pools + /lendBorrow) joined on pool UUID.
- Morpho Blue: marketId (uniqueKey deprecated 2026-05-20).
- Uniswap v3 wstETH/WETH 0.01% pool: 0x109830a1aaad605bbf02a9dfa7b0b92ec2fb7daa.
- Curve stETH/ETH indices: i=0 ETH, i=1 stETH.
- Balancer wstETH/WETH MetaStable: DO NOT use getRate() for spot — use Vault queryBatchSwap.
- Pendle: REST only (SDK archived). impliedApy is decimal not bps. wstETH-only filter per scope.

# Final commit when stopping
"ralph: session summary" with no file changes, commit body containing:
- Tasks completed (count + IDs)
- Tasks BLOCKED (IDs + reasons)
- Unit test pass rate
- Browser test pass rate
- Recommended next 5 tasks for next session

Begin now. Read SPEC.md, PROGRESS.md, RALPH.md, then start at task 0.1.
```

---

## Differences from v1

| Aspect | v1 | v2 |
|---|---|---|
| `/goal` flag references | Implied `--max-iterations 200`, `--time-budget 3h` style controls existed | Explicit: zero flags on /goal. Session-level controls only. |
| Prerequisites | Not documented | Explicit: `features.goals = true` required |
| Subcommand reference | Not included | All 5 subcommands documented |
| Prompt length | ~135 lines | ~95 lines (tightened phrasing, same content) |
| Setup steps | Mixed with prompt | Numbered, ordered, separated from loop instructions |
