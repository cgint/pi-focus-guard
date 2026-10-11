# goal-loop — requirements

Date: 2026-10-20 · Status: **requirements (settled; command naming amended 2026-10-11; submit variant added 2026-10-11)** · Owner: Firstmate (user owns requirements)

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
   Three commands (settled by user, 2026-10-20; **amended 2026-10-11: all user commands in
   this repo are `focus-`-prefixed** — see `/focus-write-guard`, `/focus-discuss`,
   `/focus-commit-guard`, `/focus-crazy-find-guard` — so the goal commands carry the same
   prefix. Distinct top-level names so autocomplete lists them and the user need not recall
   a suffix):
   - `/focus-goal-start <definition>` — start the goal; the turn-end cross-check is armed.
     The definition is a simple string of at most 500 characters with no structured
     conventions — the user writes the goal in plain language (see requirement 2a for what
     it may describe).
   - `/focus-goal-end` — end (cancel) the goal; the cross-check is disarmed and the goal
     discarded without judgment of whether it was achieved.
   - `/focus-goal` — show the current goal (the definition string) and its state (active
     or none).
   An active goal stays in effect across turns until the user runs `/focus-goal-end`.
   **Four commands** (submit variant added 2026-10-11):
   - `/focus-goal-start-submit <definition>` — start the goal (identical to
     `/focus-goal-start`) **and** immediately submit the definition text as a user-role
     message, triggering an agent turn that starts working toward the goal. This is the
     "arm and go" form: for when the goal itself is the task to start right now (see
     requirement 2b for the passive/active distinction).
2. **The goal description is free text; "done" is defined by it, case by case.** The
   `<definition>` is a plain string — no flags, no syntax, no parsing conventions. Whatever
   makes the goal "complete" (a test that must pass, a plan that must be finished, a file
   that must exist, etc.) is stated in the goal description itself. The cross-check judges
   the goal against that description; there is no separate mechanical-vs-plan split enforced
   by the feature. (e.g. `/focus-goal-start "npm test passes and the migration is applied"`.)
   - **2a. What the description may reference** — anything the user wants: a command to run,
     a plan file, a condition, or a combination. The feature does not interpret or validate
     the string; it passes the goal's own description to the cross-check.
   - **2b. Passive vs. active goal start (submit variant, added 2026-10-11).**
     `/focus-goal-start` is **passive**: it arms the cross-check and waits for the user's
     next prompt to kick off work. `/focus-goal-start-submit` is **active**: it arms the
     cross-check and immediately submits the goal text as the user message of a new agent
     turn, so the agent starts working toward the goal in the same command. Both start the
     identical goal (same definition, same ≤500-char limit, same cross-check arming); they
     differ only in what happens after arming. The submit variant exists to close the gap
     where the user would otherwise have to type the goal, then type a second prompt (or
     re-express the goal) to make the agent engage with it — the same friction the sibling
     `pi-mini-self-org` feature `user-pin-submit` (docs/feature-impl/20261021-user-pin-submit
     there) closed for user directives.
3. **Check at the handoff moment.** Just before the agent would return control to the user,
   if a goal is still active, the agent is nudged to cross-check the goal against the current
   state and then decide: come back to the user (done) or continue working (not done).
4. **The agent decides; the feature only nudges.** There is no fixed cross-check budget or
   forced-release cap in the first version. Each nudge asks the agent to reflect; the agent
   may release at any point it judges the goal reached, or keep going. (A budget/loop-guard
   is a possible later refinement, not part of v1 — see `3_plan__goal-loop.md`.)
5. **User is always in control.** The user can end the turn, run `/focus-goal-end`, or
   override the outcome at any time. The goal-loop nudges the agent; it never locks the
   user out.
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

- `/focus-goal-start "<def>"` (a plain string, ≤500 chars) starts a session-scoped goal; the
  turn-end cross-check is armed for that goal.
- `/focus-goal-start-submit "<def>"` starts the identical session-scoped goal AND submits the
  definition as a user-role message that triggers an agent turn (idle → sent immediately;
  busy → queued as a follow-up). Validation (≤500 chars, non-empty) applies identically and
  happens before any submission.
- With an active goal, at the moment the agent would return control, the agent is nudged to
  cross-check the goal and decides release vs. continue — the feature does not force a
  fixed number of re-checks in v1.
- `/focus-goal-end` immediately disarms the cross-check and clears the goal for the session.
- `/focus-goal` shows the active goal's definition, or "no active goal" when none is set.
- A goal does not survive a session restart (session-scoped only).
- The goal description is passed through as-is (no parsing, no flag validation); a
  description over 500 characters is rejected with a clear message.

## Resolved (2026-10-20, user decisions; amended 2026-10-11)

1. **Home repo** — pi-focus-guard. Confirmed.
2. **Persistence** — session-only; no project-setting form.
3. **Cross-check budget** — none in v1; the agent is nudged and may release at any point it
   judges the goal reached. (Loop-guard/budget deferred to a possible later version.)
4. **"Plan complete"** — defined case by case in the goal description itself; no fixed
   criterion.
5. **Check-script robustness** — out of scope for this feature (the feature does not run or
   manage check scripts; that is the agent's / user's business).
6. **Directory naming** — `20261020-goal-loop` (renamed from the erroneous `20260715`).
7. **`/focus-goal-start` grammar** — a simple string, no conventions, max 500 characters.
8. **Command naming (amendment, 2026-10-11, user)** — all user commands in this repo are
   `focus-`-prefixed; the goal commands are therefore `/focus-goal-start`,
   `/focus-goal-end`, `/focus-goal`. The original bare names (`/goal-start`, `/goal-end`,
   `/goal`) were a mistake: they break the repo's naming convention and the
   "registers only focus-prefixed user commands" test invariant.
9. **Submit variant (added, 2026-10-11, user)** — `/focus-goal-start-submit <definition>`
   adds a fourth command: arm the goal AND submit the definition text as a user-role
   message that triggers an agent turn. Passive/active semantics per requirement 2b;
   inspiration: `pi-mini-self-org` `user-pin-submit`
   (`/Users/cgint/dev-external/pi-mini-self-org/docs/feature-impl/20261021-user-pin-submit/`).
   Mechanism: `pi.sendUserMessage(text, { expandPromptTemplates: false })` when the session
   is idle, `{ deliverAs: "followUp" }` when busy (sibling's verified routing; Pi 1.1.0 SDK
   `sendUserMessage` signature confirmed in this repo).
