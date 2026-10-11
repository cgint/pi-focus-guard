# Goal Loop

[← Back to Main README](../../README.md) · [Feature Index](README.md)

Goal loop provides session-scoped end-state anchoring with turn-end cross-checking and autonomous nudging.

---

## Goal & Intent

Keeps long-running, multi-step agent tasks aligned with an explicit objective. Instead of releasing control prematurely after completing one sub-task, the goal loop nudges the agent at the end of each turn to self-evaluate whether the goal is genuinely achieved.

---

## Commands

| Command | Description |
| :--- | :--- |
| `/focus-goal-start <definition>` | Validate and arm session goal ($\le 500$ chars) without triggering a turn |
| `/focus-goal-start-submit <definition>` | Arm goal and immediately submit definition as user prompt to start work |
| `/focus-goal-suggest` | Ask the agent to propose a single adoptable session goal |
| `/focus-goal` | Print active goal definition, or report that none is active |
| `/focus-goal-end` | Disarm and clear active goal without judging completion |

---

## Command Details

### `/focus-goal-start <definition>`
* Validates definition length ($\le 500$ characters) and arms turn-end nudge.
* Informs the model via an informational custom message without starting an agent turn.

### `/focus-goal-start-submit <definition>`
* "Arm and go" form: validates and arms identical to `/focus-goal-start`, then immediately submits `<definition>` as a user prompt.
* **Idle-Aware Routing:**
  * When the session is idle, sent immediately as a new turn.
  * When the session is busy (agent streaming), queued as a follow-up (`deliverAs: "followUp"`).
* Prompt template expansion is disabled (`expandPromptTemplates: false`) so the goal definition passes through verbatim.

### `/focus-goal-suggest`
* Emits a standardized fixed prompt asking the agent to propose one session goal definition ($\le 500$ chars, single line) plus rationale.
* Details must live in files per repo standards.
* Suggestion only: does not arm or mutate goal state. The user can adopt it with `/focus-goal-start` or `/focus-goal-start-submit`.
* Uses the same idle-aware routing as `/focus-goal-start-submit`.

---

## Turn-End Cross-Check Mechanics

1. When an agent turn finishes (`agent_end`) and an active goal is set:
2. The extension sends a steering nudge message carrying the exact goal description:
   ```text
   [goal-reminder] active goal: "<definition>"
     → cross-check: is this goal genuinely reached? if not, keep working;
     if it is, release to the user. (extension nudge, not user input)
   ```
3. Delivered as `steer` with `triggerTurn: true`.
4. A re-entrancy latch (`isNudging`) prevents the steer turn itself from triggering runaway looping; the latch is cleared when the agent settles (`agent_settled`) or on `session_start`.
5. The agent independently judges whether the goal is reached: if achieved, it releases back to the user; if incomplete, it continues working.

---

## Lifecycle & Persistence

* The goal is **strictly session-scoped**: stored in module memory and cleared on session restart or end.
* It does not persist to disk, history, or `.pi/settings.json`.

---

## Footer Status Indicator

* `🎯` — Goal is active.
* *(Cleared / empty slot)* — No goal active.
