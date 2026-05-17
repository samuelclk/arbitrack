# Ralph Loop Prompt — ArbiTrack

You are extending ArbiTrack via a Ralph loop. Follow these steps every iteration.

## Per-iteration flow

1. **Read** `PROGRESS.md` top-to-bottom.
2. **Find** the first task whose checkbox is `[ ]` AND whose listed dependencies are all `[x]`.
   - If none exists, print `RALPH DONE` and exit.
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
- NEVER edit `PROGRESS.md` except: (a) flip task state `[ ]`↔`[x]`/`[!]`, (b) append a `BLOCKED:` line.
- NEVER skip the verification step.
- NEVER invent task IDs or add new tasks.
- NEVER use `git --no-verify`, `git reset --hard`, `git push --force`, or `rm -rf`.
- If a task is ambiguous: mark `[!]` `BLOCKED: ambiguous — needs human` and exit. Do not guess.
- If verification depends on a secret missing from `.env.local`: mark `[!]` `BLOCKED: missing env var <NAME>` and exit.

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
