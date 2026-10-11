# goal-loop — plan (early technical grounding)

Date: 2026-10-20 (draft) · Status: **plan (early, pre-architecture)** · Owner: Firstmate

> Technical/early-info only — the user-facing behavior is in `2_requirements__goal-loop.md`.
> This file captures mechanism grounding and open technical unknowns, not the final design.
> Home repo: **pi-focus-guard** (confirmed 2026-10-20).

## v1 scope (settled)

The goal is a **plain string** (≤500 chars, no parsing). At `agent_end`, if a goal is active,
inject a nudge so the agent cross-checks the goal against the current state and decides
release vs. continue. **No fixed cross-check budget, no loop-caps in v1** — the agent is
nudged and may release at any point it judges the goal reached. The extension does **not**
run or manage check scripts; whatever the goal references is the agent's business. This is a
deliberate first-version simplification.

## Mechanism: the agent-end steer

The "cross-check before returning to the user" uses the same hook + injection mechanism as
`pi-subagent-herdr`'s **agent-end-pane-reminders** (implemented and live-verified on Pi
1.0.0) and `pi-self-reflect`. The difference for goal-loop: the trigger is **a goal is
active** (not "owned live pane exists"), and the injected picture is **the goal's own
description string** (not pane status).

### Hook choice (settled by sibling evidence)

- **`agent_end` + `pi.sendMessage(nudge, { triggerTurn: true, deliverAs: "steer" })`** —
  chosen. `agent_end` returns `void` (side effects only; cannot append to context or force a
  turn by itself), so it injects a steer that queues a message and forces one more LLM turn.
  Proven idiom from `pi-self-reflect` (search `agent_end` + `sendMessage` in its
  `src/index.ts`); verified in this session against `pi-self-reflect` source.
- **`agent_before_settle`** (returns `BoundaryResult`, can append entries + `continue`) —
  dropped in the sibling: its `canContinue` gate is fiddly. More maintenance, no real gain.
- **`agent_settled`** — dead end: plain event, no entries/BoundaryResult; you cannot append a
  message at `agent_settled`.

> Unverified here: whether the steer-from-`agent_end` continuation turn actually fires on
> pi-focus-guard's host version. Source-plausible + proven in two sibling repos, but never run
> in pi-focus-guard. A 5-line spike should confirm before building on it.

### Loop safety — v1 has a re-entrancy latch only; budgets are deferred

Because an injected steer **re-triggers `agent_end`**, a bare implementation would nudge
again on its own injected turn. The minimal guard for v1:

- **Re-entrancy latch** (`isNudging`): if a nudge is already in flight, don't fire another.
  Set/clear in try/finally. This alone stops immediate self-looping.

The sibling's additional caps (per-user-turn budget, max auto-continues, reset-only-on-genuine-
user-input) are **deferred to a later version** — the user settled v1 as "no budget; the agent
is nudged and decides." If the nudge turns out to loop in practice, those guards are the
documented escalation path (borrow from agent-end-pane-reminders, whose caps are: max 3
auto-continues, per-turn budget 2 — unverified against its source; confirm before adopting).

### Injection content: the goal's own description, no verdict

Inject the goal verbatim as a nudge with no verdict ("anti-magic": the extension never tells
the agent what to decide). The agent self-evaluates — no separate classifier LLM call.

```
[goal-reminder] active goal: "<the definition string as given>"
  → cross-check: is this goal genuinely reached? if not, keep working;
  if it is, release to the user. (extension nudge, not user input)
```

> The feature does not run any command the goal references — it hands the goal's description
> to the agent, which decides how to verify it (run a test, read a plan, etc.).

## In-repo integration points (verified present in pi-focus-guard)

- **Command registration:** `pi.registerCommand` — already used for `/focus-write-guard`,
  `/focus-discuss`, `/focus-commit-guard` in `src/focus-guard.ts`. `/goal-start`, `/goal-end`,
  and `/goal` follow this exact pattern.
- **Status indicator:** `ctx.ui.setStatus` — already used for write-guard/discuss/commit
  status in `src/focus-guard.ts`. The goal-active indicator (shows the active goal / none)
  follows the same pattern.
- **No existing turn-intercept in this repo:** `pi.on("agent_end")` / `pi.sendMessage(steer)`
  is *new* to pi-focus-guard (it lives in the siblings). This is the one genuinely novel,
  risk-bearing piece.

## Open technical unknowns (spikes needed before this becomes an architecture)

1. **Spike — steer-from-`agent_end` on this host:** confirm the continuation turn actually
   fires on pi-focus-guard's host Pi version (5-line probe extension). Primary gate.
2. **Spike — re-entrancy predicate:** confirm `event.source` for extension-originated input
   in *this* host, so the re-entrancy latch / "genuine user input" distinction is pinned
   exactly (needed if the budget is ever added back).
3. **`agent_end` → retry interplay (sibling OQ3):** whether an auto-retry of a failed run
   re-fires `agent_end` before `agent_settled` — could cause a double nudge. Unverified.

## Out of scope for v1 (deferred, not dropped)

- **Cross-check budget / max auto-continues** — added only if the nudge loops in practice
  (escalation path: sibling's three nested caps).
- **Check-script robustness** (hangs, flakiness) — out of scope per user decision; the feature
  does not run or manage check scripts.
- **Goal persistence** — session-only; no `.pi/settings.json` form.

## Not yet decided (deferred to architecture)

- Exact status-string format for the goal-active indicator.
- Where the goal state lives in memory (module-level variable vs. session context).
- The 500-char limit enforcement point (command handler rejects over-length with a message).
