# goal-suggest — idea

Date: 2026-10-11 · Status: **idea** · Owner: Firstmate (user owns requirements)

> Companion feature to `docs/feature-impl/20261011-goal-loop/` (same repo, same goal
> subsystem). User-facing requirements in `2_requirements__goal-suggest.md`.

## Problem

`/focus-goal-start <definition>` (goal-loop) requires the user to compose the goal
definition themselves. A well-formed goal is more than a short phrase: it should point
the agent at step-by-step forward motion, define when it must stop for the user, and
delegate detail to files instead of bloating the definition string. Writing that from
scratch every time is friction — and the shape of "a good goal" is something the agent
can be asked to propose for the current project, right now.

## Idea

A fifth goal command, `/focus-goal-suggest`:

1. User runs `/focus-goal-suggest` (no arguments).
2. The extension emits a fixed prompt to the LLM (a user-role message that triggers an
   agent turn — same mechanism as `/focus-goal-start-submit`, which is verified in this
   repo: idle → sent immediately; busy → queued as a follow-up).
3. The LLM comes back with exactly one proposed goal definition (light, ≤500 chars —
   the `/focus-goal-start` limit) plus a brief rationale, ready to be adopted.
4. The user sets the goal explicitly via `/focus-goal-start` or
   `/focus-goal-start-submit`. Suggest never sets the goal itself.

## Why the prompt matters more than the command

The command is trivial (register + send one message); the feature is the **prompt
text**. It encodes the working-style contract the user settled verbally:

- go far step-by-step, stopping only when the user is clearly needed (requirements,
  goal-setting) or when SEVERELY blocked;
- otherwise use tools, skills, sub-agents, and the advisor wisely;
- keep the goal definition itself light — detail (description, plan, status) lives in
  files according to this repo's documentation standard (`docs/feature-impl/`
  convention, see `docs/feature-impl/README.md`);
- the definition string respects the goal-start max length (500 chars,
   `GOAL_MAX_LENGTH` in `src/goal/goal.ts`).

## Open questions (carry into requirements)

- Exact prompt wording (draft in `2_requirements__goal-suggest.md`, §Prompt text) —
  user reviews before settling.
- Whether the emitted prompt should be a user-role message (`sendUserMessage`) or a
  custom-type message (`sendMessage`); hypothesis: user-role, matching
  `/focus-goal-start-submit`, so the proposal appears as a normal turn in the transcript.
