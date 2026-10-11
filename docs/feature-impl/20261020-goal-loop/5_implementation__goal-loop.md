# goal-loop — implementation notes (v1)

Date: 2026-10-20 · Status: **implemented** · Owner: implementer (handoff)

## What was built

- **`src/goal/goal.ts`** — new module exporting `registerGoalLoop(pi)` plus
  `GOAL_STATUS_KEY`, `GOAL_MAX_LENGTH`, `getActiveGoal()`, `formatGoalNudge()`,
  and the `_resetGoalLoopForTests()` seam.
- **`src/focus-guard.ts`** — one-line wiring: `registerGoalLoop(pi)` at the end
  of the `focusGuard` entry (see deviation 1). No other changes.
- **`test/goal-loop.test.ts`** — 16 tests: command registration (focus-goal + full
  entry), start/end/show handling, 500-char rejection (and boundary acceptance),
  empty-definition usage message, session-scoped reset on `session_start`,
  nudge firing on `agent_end` with active goal (verbatim definition,
  `{ triggerTurn: true, deliverAs: "steer" }`), no nudge without a goal or
  after `/focus-goal-end`, and the re-entrancy latch behavior.
- **`test/focus-guard.test.ts`** — the registered-commands assertion now
  includes `focus-goal`, `focus-goal-end`, `focus-goal-start` (mechanical
  registry update; the test's own logic unchanged).

## Behavior summary

- `/focus-goal-start <definition>`: plain string, trimmed, ≤500 chars (reject
  with an error message above that), arms the cross-check, sets status `⭕`,
  notifies, and informs the agent (custom message, `triggerTurn: false`).
- `/focus-goal-end`: disarms and discards, status back to `🎯`.
- `/focus-goal`: shows the active definition or "No active goal".
- Status key `a4_goal`, symbols `🎯` (none) / `⭕` (active), same pattern as the
  existing guards.
- Turn-end cross-check: `pi.on("agent_end")` → if a goal is active and the
  `isNudging` latch is clear, send `formatGoalNudge(goal)` via
  `pi.sendMessage(msg, { triggerTurn: true, deliverAs: "steer" })`. Nudge text
  carries the definition verbatim, no verdict (anti-magic), labeled as an
  extension nudge.
  Nudge frequency (v1): at most one nudge per settled agent run while a goal is
  active; the latch re-arms on `agent_settled`; no budget — each subsequent
  turn end may nudge again.
- State is module-level (session-scoped), reset on `session_start`. No
  persistence, no flags, no budget/loop cap — per settled spec.

## Deviations / notes

1. **Registration order.** `registerGoalLoop(pi)` is called at the *end* of the
   `focusGuard` entry, not the top: the existing tests in
   `test/focus-guard.test.ts` index `pi._callbacks.session_start[0]` (and
   `agent_settled[0]`) assuming the focus-guard handler is registered first.
   Registering the goal handlers first would have broken ~17 existing
   assertions.
2. **Latch clear point.** The handoff said "set/clear in try/finally". A
   try/finally around `sendMessage` clears the latch as soon as the *send*
   resolves — but the steer message then runs its own LLM turn, whose
   `agent_end` would fire while the latch is already clear, double-nudging.
   Instead the latch is set in the `agent_end` handler and cleared on
   `agent_settled` (unconditionally). This matches the
   spike evidence (`4_spike_results.md`: the steer continuation turn re-fires
   `agent_end`; the run only settles afterwards) and keeps the existing
   focus-guard "settled disarms the machinery" semantics for the no-goal case.
   Net effect in v1: each user turn ends in exactly one nudge while a goal is
   active; if the agent keeps working, the next turn end nudges again (no
   budget by design).
   (First implementation shipped with an inverted gate, `if (!activeGoal)
   isNudging = false`, which never re-armed the latch — caught by the
   re-arm test during acceptance review; fixed to an unconditional clear.)
3. **`/focus-goal-start` also informs the agent** (custom message, no turn) so the
   agent knows a goal is active even without waiting for the first turn end —
   mirrors how discuss/commit mode changes notify the agent. Not in the spec;
   harmless and consistent with existing patterns.
4. **No `event.source` check** in the latch (the verified `"extension"` source
   predicate from the spike is not needed for the v1 latch, which is
   state-based rather than event-based; it would matter if a budget/
   "genuine user input" gate is added later).
5. Test-only exports (`_resetGoalLoopForTests`) exist because module state
   persists across tests in one file; no production code depends on them.

## Checks

- `npm run typecheck` — pass.
- `npm test` — pass (8 files, 190 tests, incl. all pre-existing tests).

## Open items (out of v1 scope)

- OQ3 from the plan: `agent_end` → auto-retry interplay (double-nudge on a
  failed run) — unverified; revisit with a budget version.
- Budget / max auto-continues — deferred per settled spec.
