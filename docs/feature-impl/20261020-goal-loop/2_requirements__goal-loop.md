# goal-loop — requirements

Date: 2026-10-20 · Status: **requirements (settled)** · Owner: Firstmate (user owns requirements)

> Non-technical, user-facing requirements only. Technical mechanism, hook choice, and
> guard design live in `3_plan__goal-loop.md`.
> Home repo: **pi-focus-guard** (confirmed, 2026-10-20).

## Problem

The agent ends its turn and hands control back to the user even when the job isn't actually
done — it narrates intent ("tests will pass once CI finishes"), declares a plan finished
while tasks remain, or simply stops before the end state is reached. The user then has to
notice and re-prompt. The goal-loop makes the agent itself check its active goal at the
handoff moment and decide: release to the user (genuinely done) or keep going (not done yet).

## What the feature must do (user-facing)

1. **Define and end an active goal (session-scoped).** The user starts exactly one active
   goal for the session, describing an end state; and ends it. The goal exists only for the
   session — it is not persisted to a project setting and does not survive a restart.
   Three commands (settled by user, 2026-10-20; distinct top-level names so autocomplete
   lists all three and the user need not recall a suffix):
   - `/goal-start <definition>` — start the goal; the turn-end cross-check is armed. The
     definition is a simple string of at most 500 characters with no structured conventions
     — the user writes the goal in plain language (see requirement 2a for what it may
     describe).
   - `/goal-end` — end (cancel) the goal; the cross-check is disarmed and the goal discarded
     without judgment of whether it was achieved.
   - `/goal` — show the current goal (the definition string) and its state (active or none).
   An active goal stays in effect across turns until the user runs `/goal-end`.
2. **The goal description is free text; "done" is defined by it, case by case.** The
   `<definition>` is a plain string — no flags, no syntax, no parsing conventions. Whatever
   makes the goal "complete" (a test that must pass, a plan that must be finished, a file
   that must exist, etc.) is stated in the goal description itself. The cross-check judges
   the goal against that description; there is no separate mechanical-vs-plan split enforced
   by the feature. (e.g. `/goal-start "npm test passes and the migration is applied"`.)
   - **2a. What the description may reference** — anything the user wants: a command to run,
     a plan file, a condition, or a combination. The feature does not interpret or validate
     the string; it passes the goal's own description to the cross-check.
3. **Check at the handoff moment.** Just before the agent would return control to the user,
   if a goal is still active, the agent is nudged to cross-check the goal against the current
   state and then decide: come back to the user (done) or continue working (not done).
4. **The agent decides; the feature only nudges.** There is no fixed cross-check budget or
   forced-release cap in the first version. Each nudge asks the agent to reflect; the agent
   may release at any point it judges the goal reached, or keep going. (A budget/loop-guard
   is a possible later refinement, not part of v1 — see `3_plan__goal-loop.md`.)
5. **User is always in control.** The user can end the turn, run `/goal-end`, or override the
   outcome at any time. The goal-loop nudges the agent; it never locks the user out.
6. **Visible status.** The user can see at a glance whether a goal is active (and its
   definition) or that no goal is active.
7. **Honest "done".** If the agent claims the goal is met but the evidence (per the goal's
   own description) does not support it, that must be surfaced — the cross-check is meant to
   catch premature "done," not rubber-stamp it.

## What the feature must NOT do

- It must not auto-complete or auto-modify the goal on the user's behalf; it brings the goal
  to the agent's attention and lets the agent act with its normal authority.
- It must not hide a premature "done" behind the agent's own claim without a cross-check.
- It must not persist goals beyond the session or impose structured syntax on the goal
  description.

## Acceptance criteria (behavioral)

- `/goal-start "<def>"` (a plain string, ≤500 chars) starts a session-scoped goal; the
  turn-end cross-check is armed for that goal.
- With an active goal, at the moment the agent would return control, the agent is nudged to
  cross-check the goal and decides release vs. continue — the feature does not force a
  fixed number of re-checks in v1.
- `/goal-end` immediately disarms the cross-check and clears the goal for the session.
- `/goal` shows the active goal's definition, or "no active goal" when none is set.
- A goal does not survive a session restart (session-scoped only).
- The goal description is passed through as-is (no parsing, no flag validation); a
  description over 500 characters is rejected with a clear message.

## Resolved (2026-10-20, user decisions)

1. **Home repo** — pi-focus-guard. Confirmed.
2. **Persistence** — session-only; no project-setting form.
3. **Cross-check budget** — none in v1; the agent is nudged and may release at any point it
   judges the goal reached. (Loop-guard/budget deferred to a possible later version.)
4. **"Plan complete"** — defined case by case in the goal description itself; no fixed
   criterion.
5. **Check-script robustness** — out of scope for this feature (the feature does not run or
   manage check scripts; that is the agent's / user's business).
6. **Directory naming** — `20261020-goal-loop` (renamed from the erroneous `20260715`).
7. **`/goal-start` grammar** — a simple string, no conventions, max 500 characters.
