## goal-loop — implementation notes (v1 + submit variant)

Date: 2026-10-20 · Status: **implemented (submit variant added 2026-10-11)** · Owner: implementer (handoff)

## What was built

- **`src/goal/goal.ts`** — new module exporting `registerGoalLoop(pi)` plus
  `GOAL_STATUS_KEY`, `GOAL_MAX_LENGTH`, `getActiveGoal()`, `formatGoalNudge()`,
  and the `_resetGoalLoopForTests()` seam.
- **`src/focus-guard.ts`** — one-line wiring: `registerGoalLoop(pi)` at the end
  of the `focusGuard` entry (see deviation 1). No other changes.
- **`test/goal-loop.test.ts`** — 23 tests: command registration (4 commands +
  full entry), start/start-submit/end/show handling, 500-char rejection (and
  boundary acceptance), empty-definition usage message, submit routing
  (idle/busy), pre-submission validation for the submit variant, session-scoped
  reset on `session_start`, nudge firing on `agent_end` with active goal
  (verbatim definition, `{ triggerTurn: true, deliverAs: "steer" }`), no nudge
  without a goal or after `/focus-goal-end`, and the re-entrancy latch behavior.
- **`test/focus-guard.test.ts`** — the registered-commands assertion now
  includes `focus-goal`, `focus-goal-end`, `focus-goal-start`,
  `focus-goal-start-submit` (mechanical registry update; the test's own logic
  unchanged).

## Behavior summary

- `/focus-goal-start <definition>`: plain string, trimmed, ≤500 chars (reject
  with an error message above that), arms the cross-check, sets status `⭕`,
  notifies, and informs the agent (custom message, `triggerTurn: false`).
  **Passive**: after arming it waits for the user's next prompt.
- `/focus-goal-start-submit <definition>`: identical validation and arming to
  `/focus-goal-start` (same `startGoal()` path), **plus** it immediately
  submits the definition as a user-role message via `pi.sendUserMessage`:
  idle (`ctx.isIdle()`) → `await pi.sendUserMessage(definition, { expandPromptTemplates: false })`
  (sent immediately as a new turn); busy →
  `await pi.sendUserMessage(definition, { deliverAs: "followUp", expandPromptTemplates: false })`
  (queued as a follow-up). Validation (non-empty, ≤500) runs *before* any
  submission — a rejected definition neither arms nor sends. `expandPromptTemplates: false`
  prevents the goal text from being interpreted as template/skill/command syntax.
- `/focus-goal-end`: disarms and discards, status icon cleared (no goal icon).
- `/focus-goal`: shows the active definition or "No active goal".
- Status key `a4_goal`, icon `🎯` (active) / cleared (no goal), same pattern as the
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

6. **Submit-variant idle predicate (2026-10-11).** `ctx.isIdle()` **does exist**
   on the command-handler context in Pi 1.1.0 (`ExtensionContext.isIdle(): boolean`,
   inherited by `ExtensionCommandContext`), so `/focus-goal-start-submit` uses it
   directly — no deviation, no SDK equivalent needed. Routing mirrors the
   sibling's verified `user-pin-submit`: idle → direct send, busy →
   `deliverAs: "followUp"`; `expandPromptTemplates: false` in both cases.
   (Session-scoped by design: no persistence, unlike the sibling's appendEntry.)

## Known Limitations

- **Compaction-in-flight submit is dropped (live upstream gap).** While a session
  compaction is in flight, `pi.sendUserMessage` throws before the followUp
  queue is reached (upstream #8435 — auto-closed, *not* maintainer-adjudicated;
  guard still present in pinned 1.1.0), so `/focus-goal-start-submit` and
  `/focus-goal-suggest` arm/prompt but the trigger turn is not started. The
  goal stays armed and the next `agent_end` nudge re-arms the cross-check. No
  extension-side retry is implemented (deliberate deferral). Full analysis,
  verified upstream status, and the working retry pattern: see
  [`6_known-limitation__compaction-submit.md`](6_known-limitation__compaction-submit.md).

## Checks

- `npm run typecheck` — pass.
- `npm test` — pass (8 files, 197 tests, incl. all pre-existing tests).

## Open items (out of v1 scope)

- OQ3 from the plan: `agent_end` → auto-retry interplay (double-nudge on a
  failed run) — unverified; revisit with a budget version.
- Budget / max auto-continues — deferred per settled spec.
