# goal-suggest — plan

Date: 2026-10-11 · Status: **plan (settled; small-scope, no spikes)** · Owner: Firstmate

> Technical plan for `/focus-goal-suggest`. User-facing behavior is settled in
> `2_requirements__goal-suggest.md` (prompt wording signed off by the user, 2026-10-11).

## Design

Single new command, zero new state. The goal-loop subsystem (`src/goal/goal.ts`) gains a
fifth command; no new module, no new session state, no new hooks.

### Prompt constant

The prompt text (settled, verbatim) is an exported string constant
`GOAL_SUGGEST_PROMPT` in `src/goal/goal.ts` — exported so tests assert against the same
string the command sends (anti-drift). Content: the signed-off text from
`2_requirements__goal-suggest.md` §Prompt text (user-role second person; "need me (the
user)"; repo-agnostic "this repo's documentation standard"; 500-char limit; single-line
definition + rationale).

### Command: `/focus-goal-suggest`

- Registered in `registerGoalLoop` via `pi.registerCommand("focus-goal-suggest", …)`,
  alongside the four existing goal commands.
- **No arguments**: any args are ignored (identical prompt regardless of input).
- **Emission** (settled mechanism — the hypothesis from the idea doc, confirmed by the
  working `/focus-goal-start-submit` code path in the same file): user-role message via
  `pi.sendUserMessage(GOAL_SUGGEST_PROMPT, { expandPromptTemplates: false })`:
  - session idle (`ctx.isIdle()`) → sent immediately, triggers an agent turn;
  - session busy → `{ deliverAs: "followUp" }` so the prompt is queued, not lost.
- **No side effects on goal state**: does not touch `activeGoal`, `isNudging`, the
  footer status, or the `agent_end` cross-check. Suggest never arms the loop.
- No UI notify: the emitted user message + the agent's proposed goal are the visible
  result; the acceptance criteria define no notify behavior.

### Why not a custom-type `sendMessage`?

A custom-type `steer` would hide the prompt from the user's transcript as a regular
message and would not read as "the user asked for a proposal." The user-role message
matches `/focus-goal-start-submit` (verified working in this repo on Pi 1.1.0) and keeps
the prompt visible and verbatim in the transcript (requirement: "the prompt appears in
the transcript verbatim").

## Test coverage (vitest, `test/goal-loop.test.ts`)

Follows the existing mock seams (`createPiMock`, `createCtx`, `invoke`).

1. Registration: the command set is now five commands; `/focus-goal-suggest` is wired
   through the `focusGuard` entry point.
2. Idle: `sendUserMessage(GOAL_SUGGEST_PROMPT, { expandPromptTemplates: false })`
   exactly once — exact prompt string (imported constant), no `deliverAs`.
3. Busy: `sendUserMessage(GOAL_SUGGEST_PROMPT, { deliverAs: "followUp", expandPromptTemplates: false })`.
4. Prompt invariance: invoked with arbitrary args → identical prompt sent.
5. No goal side effects: after suggest, `getActiveGoal()` is `null`, no custom-type
   `sendMessage` was emitted, and `agent_end` does not nudge (nothing armed).

## Gate

`npm run precommit` (`tsc --noEmit && npm test && npm audit --audit-level=moderate`)
green. No dependency or lockfile changes, so the audit is expected to stay clean.

## Risks / unknowns

- **Runtime behavior of `sendUserMessage` with a long multi-line prompt**: untested
  live. The mechanism is proven for short goal strings (submit variant); the only delta
  is message length/format. Verifiable by running `/focus-goal-suggest` in a real Pi
  session after the gate — noted as live-verification, not a blocker (the unit tests
  pin the call shape).
- Nothing else: no hooks, no state, no parsing.
