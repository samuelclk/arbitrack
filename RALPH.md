# Ralph Loop Prompt — ArbiTrack

You are extending ArbiTrack via a Ralph loop. Follow these steps every iteration.

---

## Launch command (v2)

Paste this into Claude Code to start the build:

```
/ralph "Follow RALPH.md exactly. Each iteration: read PROGRESS.md, find first [ ] task whose deps are ALL [x] (treat [!] as not-done; skip tasks whose deps include any [!]), read SPEC.md sections it references (e.g. 'SPEC §3.4', 'SPEC §6.2'), implement only the listed files, run the verification command exactly as written, mark [x] on pass or [!] with a single BLOCKED: line on hard fail, commit 'ralph(<id>): <title>' (one task per commit, no batching). When no eligible [ ] task remains, emit exactly <promise>RALPH DONE</promise> on its own line and exit. NEVER emit that tag for any other reason." --max-iterations 200 --completion-promise "RALPH DONE"
```

**Flag reference** (verified against [the official plugin README](https://github.com/anthropics/claude-code/blob/main/plugins/ralph-wiggum/README.md)):

| Flag | Value | Rationale |
|---|---|---|
| `--max-iterations` | `200` | Safety cap. 55 tasks × ~3 attempts each = 165 worst case; 200 gives headroom. |
| `--completion-promise` | `"RALPH DONE"` | Substring of `<promise>RALPH DONE</promise>`. The tag wrapper exists to prevent false-positive exits — only legitimate completion emits the tagged form. |

Only those two flags exist. No env vars on the loop command itself; secrets live in `.env.local`.

To cancel mid-run: `/cancel-ralph`.

---

## Per-iteration flow

1. **Read** `PROGRESS.md` top-to-bottom.
2. **Find** the first task whose checkbox is `[ ]` AND whose listed dependencies are ALL `[x]`.
   - **Treat `[!]` as not-done.** A task whose deps include any `[!]` is NOT pickable until that blocker flips to `[x]` (manually).
   - This prevents one BLOCKED task from chain-blocking everything downstream — the loop must skip past it to other branches of the dep graph.
   - If no eligible task exists, emit exactly `<promise>RALPH DONE</promise>` on its own line and exit. Do NOT emit this tag for any other reason.
3. **Read** the SPEC.md sections referenced in the task description (e.g. "SPEC §3.4", "SPEC §6.2").
4. **Implement** the task. Constraints:
   - Touch only files explicitly listed in the task (or files clearly implied — e.g. a new adapter implies its own test/probe script).
   - Do NOT refactor unrelated code.
   - Do NOT add features beyond the task description.
   - Match existing style and conventions.
   - Use existing helpers (`getChainClient`, `pgPool`, `shared/math`, etc.) — don't duplicate.
5. **Run** the task's verification command exactly as written.
6. **On pass:**
   - Change `[ ]` to `[x]` in PROGRESS.md for this task only.
   - Run: `git add -A && git commit -m "ralph(<task-id>): <task title>"`
7. **On fail:**
   - Diagnose. Make ONE more attempt with a targeted fix.
   - If still failing: change `[ ]` to `[!]`, append `BLOCKED: <one-line error>` directly under the task line. Commit anyway with `ralph(<task-id>): blocked`.
8. **Exit.** The loop runner re-invokes for the next task.

## Hard rules

- NEVER edit `SPEC.md`.
- NEVER edit `RALPH.md`.
- NEVER edit `PROGRESS.md` except: (a) flip task state `[ ]`↔`[x]`/`[!]`, (b) append a single `BLOCKED:` line directly under the failing task.
- NEVER skip the verification step.
- NEVER invent task IDs or add new tasks.
- NEVER batch multiple tasks into one commit. One task, one commit.
- NEVER use `git --no-verify`, `git reset --hard`, `git push --force`, `rm -rf`, or any `git push`. Local commits only.
- **NEVER emit `<promise>RALPH DONE</promise>` to escape the loop.** It is reserved exclusively for "PROGRESS.md has no pickable tasks left." If you are stuck on the current task, mark it `[!]` and exit normally — do NOT promise.
- **NEVER pick a task whose deps include any `[!]`** — that's chain-blocking. Skip to the next eligible task.
- NEVER mock a failing upstream API into adapter source to make verification pass.
- If a task is ambiguous: mark `[!] BLOCKED: ambiguous — needs human` and exit. Do not guess.
- If verification depends on a secret missing from `.env.local`: mark `[!] BLOCKED: missing env var <NAME>` and exit.
- If an upstream API is unreachable after one retry with >30s timeout: mark `[!] BLOCKED: upstream <venue> unreachable` and exit. (Loop will retry on next iteration.)

## Tooling preferences

- Prefer `viem` over `ethers`.
- Prefer `zod` for any external response parsing.
- Prefer `pg` (node-postgres) — no ORM.
- Prefer typed adapters returning `Tick[]` / domain types from `packages/shared`.
- Use `tsx` to run TypeScript directly (no build step in worker).
- Probe scripts go in `apps/worker/src/scripts/probe-*.ts`.
- All adapters export named functions, no default exports.

## Commit message format

`ralph(<task-id>): <title>` — e.g. `ralph(1.2): Bybit funding adapter`
or `ralph(<task-id>): blocked` on failure.

One commit per task. No batching.
