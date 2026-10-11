# goal-loop nudge clarity — change

Date: 2026-10-11 · Status: **implemented** · Owner: Firstmate

> Refinement to the `goal-loop` feature's turn-end cross-check nudge.
> Home: `docs/feature-impl/20261011-goal-loop/` (parent feature).

## Problem

Observed in session `01a1264c` (2026-10-11, collaboration-first-software-factory):
an agent under an active goal produced a diagnostic report, named the next fix
("preserve the client's observed baseline across reconnect"), and stopped.
The user had to explicitly push the agent back into the goal loop.

The nudge fired once (verified in session JSONL, line 1790). The agent received
it, continued working (wrote the final report, cleaned up subagents), and then
stopped again. *Inferred* (agent thinking is encrypted; reconstructed from output):
the agent interpreted "if not, keep working" as "I did more work (the report),
now I'm stopping at a clean boundary."

Root cause: the nudge text (`formatGoalNudge()`) asks one vague question
("is this genuinely reached?") without distinguishing between:

- **genuinely done** — the end state exists and is verified
- **blocked/escalating** — a decision only the user can make
- **inconvenient/partial** — "I've made progress and will report where things stand"

The third case is not a valid release, but the nudge doesn't say so.

## Decision

Replace the nudge text with a structured cross-check that:

1. Names the end state explicitly
2. Demands concrete evidence, not narrative
3. Instructs the agent to use its tools/skills/subagents/advisor to continue
4. Explicitly forbids stopping on progress reports or named next steps
5. Narrows release to two paths: proven end state, or blocked on user decision

### New nudge text

```
[goal-reminder] active goal: "<goal>"
  → cross-check at turn end:
  1. What specific observable condition proves this goal is done?
  2. Does current session evidence (test result, command output, file content) confirm it exists now?
  3. If you can name a next step you can execute, execute it. Naming it is not finishing it. Continue with your tools, skills, subagents, and advisor — forward, honest progress, no hacks, no workarounds.
  4. Release to the user only if:
     a) the goal's end state is proven reached, or
     b) you are genuinely blocked on a decision only the user can make — name it.
  A progress report, status summary, or "here's what remains" is not a valid reason to stop.
  (extension nudge, not user input)
```

### What changed vs. the old nudge

| Old | New |
|-----|-----|
| "is this genuinely reached?" (one question) | 4-step structured cross-check |
| "if not, keep working" (vague) | "use your tools, skills, subagents, and advisor to make forward, honest progress" (specific) |
| (no prohibition) | "Naming it is not finishing it" + "progress report is not a valid reason to stop" |
| (no exit paths) | Two explicit release paths: proven, or blocked on user decision |

### What stays the same

- Mechanism: `agent_end` → `pi.sendMessage(steer)` — unchanged
- Re-entrancy latch: `isNudging` set/clear — unchanged
- `[goal-reminder]` marker: retained (test assertion)
- `cross-check` marker: retained (test assertion)
- No budget/loop cap in v1 — unchanged

## Files to change

1. `src/goal/goal.ts` — `formatGoalNudge()` function
2. `test/goal-loop.test.ts` — update assertions to match new nudge text

## Verification

- `npx vitest run test/goal-loop.test.ts` — green
- `npm run precommit` — green
- (Manual) Start a goal, do partial work, observe whether the agent continues
  instead of stopping at a "clean boundary"
