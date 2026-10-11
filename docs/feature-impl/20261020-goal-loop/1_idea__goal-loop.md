# goal-loop — idea

Date: 2026-10-20 · Status: **idea (settled — see requirements/plan)** · Owner: Firstmate (user owns requirements)

> This file is the original concept. The settled, simplified v1 design (plain-string goal,
> no cross-check budget, session-scoped) is in `2_requirements__goal-loop.md` and
> `3_plan__goal-loop.md`. Sections below that describe a script/plan split or a cross-check
> budget predate that simplification and are kept for the record.

## One-liner

A session-scoped goal (a plain-string description of an end state) is active; whenever the
agent is about to end its turn and hand control back to the user, it is nudged to cross-check
the goal, then decides — come back to the user (done) or keep going (not done).

## Problem

Agents end turns prematurely: they narrate intent ("tests will pass once CI finishes")
or declare a plan done while tasks remain, and hand control back to the user without the end
state actually being reached. The user then has to notice and re-prompt. The goal-loop makes
the agent itself check at the handoff moment — the same class of problem as
`agent-end-pane-reminders` in `pi-subagent-herdr`, but keyed on a goal instead of owned panes.

## End-state (settled: free text, no enforced split)

The goal is a **simple string** (≤500 chars, no conventions) describing the end state — it
may reference a test that must pass, a plan that must be finished, a file that must exist, or
a combination. The feature does not parse or validate the string; it hands the goal's own
description to the cross-check, which judges "done" case by case. (This section originally
described a script-gate / plan-file split; that was simplified away in v1 — the description
itself carries whatever the user wants.)

## Mechanism (concept level — full design in `3_plan__goal-loop.md`)

High level: at the moment the agent would hand control back, the feature cross-checks the
active goal and either releases to the user (done) or steers the agent back to keep working
(not done). v1 has **no fixed cross-check budget** — the agent is nudged and may release at
any point it judges the goal reached. This mirrors the proven sibling pattern
(`pi-self-reflect`, `pi-subagent-herdr` agent-end-pane-reminders), keyed on a goal instead
of owned panes.

The concrete hook choice, steering mechanics, loop-guard design, and in-repo integration
points are scoped to `3_plan__goal-loop.md` (not repeated here, to keep this file at concept
level).

```
┌─────────────────────────────────────────────────────┐
│ goal active (plain-string description)             │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
              agent tries to end turn
                          │
                          ▼
              [goal-loop nudge]
                          │
                          ▼
        "cross-check: is the goal (as described) reached?"
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
         done → release          not done → continue
        (return to user)        (agent keeps working)
```

## Activation (settled — see requirements)

Three commands, settled 2026-10-20: `/goal-start <definition-as-simple-string>` (arm),
`/goal-end` (cancel), `/goal` (show). Session-scoped only (no project persistence).
`<definition>` is a plain string, max 500 characters, no conventions. (This section
previously guessed a single `/goal "..."` command; that form was superseded.)

## Open questions (historical — all settled, see `2_requirements__goal-loop.md` → "Resolved")

> These were the live open questions at idea time. All are now settled (2026-10-20); kept
> here for the record.

1. **Who checks?** — Settled: the working LLM self-checks against the goal's own description;
   no separate classifier, no extension-run check script in v1.
2. **Budget** — Settled: none in v1 (agent is nudged and decides); loop-caps deferred to a
   possible later version (see `3_plan__goal-loop.md` → "Out of scope for v1").
3. **Reset semantics** — Settled: the goal persists across turns until `/goal-end` or the
   agent releases; session-scoped.
4. **Scope confirmation** — Settled: home is `pi-focus-guard` (confirmed).

## Sibling references

- `pi-self-reflect`: source of the `agent_end` + `sendMessage(triggerTurn, steer)`
  mechanism (search `agent_end` in `src/index.ts`).
- `pi-subagent-herdr` `docs/feature-impl/20261008-agent-end-pane-reminders/`:
  same intercept problem; its loop-safety guards (re-entrancy latch, budgets, reset on
  genuine user input) are the documented escalation path if goal-loop's nudge ever loops.
  Also the `agent_settled` dead-end finding
  (`5_research_sdk__agent-end-pane-reminders.md` — `agent_settled` is a plain event,
  cannot append entries; use `agent_end` + sendMessage or `agent_before_settle`).
