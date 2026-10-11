# goal-suggest — requirements

Date: 2026-10-11 · Status: **requirements (settled; prompt wording signed off by the user, 2026-10-11)** · Owner: Firstmate (user owns requirements)

> Non-technical, user-facing requirements only. Home repo: **pi-focus-guard** (same as
> `docs/feature-impl/20261011-goal-loop/`, whose `/focus-goal-start` rules this feature
> must respect).

## Problem

See `1_idea__goal-suggest.md`. In one line: composing a good goal definition by hand is
friction; the agent should be able to propose one, on demand, for the current project.

## What the feature must do (user-facing)

1. **One new command: `/focus-goal-suggest`**, taking no arguments. It emits the fixed
   prompt (§Prompt text) to the LLM, triggering an agent turn in which the LLM proposes
   a goal. The user then sets the goal with the existing `/focus-goal-start` or
   `/focus-goal-start-submit`. Suggest never starts, modifies, or ends a goal.
2. **The proposed goal must be adoptable as-is.** The LLM presents exactly one proposed
   goal definition, on a single line, that fits the `/focus-goal-start` rules verbatim:
   a plain string of **at most 500 characters** (the goal-start max length). It also
   gives a brief rationale (not part of the definition).
3. **The goal stays light; detail lives in files.** The prompt instructs the LLM that
   the definition string is a short, plain-language end state — not a task list — and
   that the description, plan, and status are written down in files according to this
   repo's documentation standard (`docs/feature-impl/<YYYYMMDD>-<feature>/`, per
   `docs/feature-impl/README.md`), with the goal referencing them.
4. **The working-style contract is part of the prompt.** The proposed goal must allow
   the agent to go far step-by-step, stopping only when the user is clearly needed
   (requirements, goal-setting) or when SEVERELY blocked, and otherwise to move
   forward by using its tools, skills, sub-agents, and advisor wisely.

## Prompt text (settled — user sign-off 2026-10-11)

`/focus-goal-suggest` emits this prompt as a user-role message (`expandPromptTemplates`
off; idle → sent immediately, busy → queued as a follow-up — same routing as
`/focus-goal-start-submit`):

```text
[goal-suggest] Propose one session goal for this project that I can adopt with /focus-goal-start.

If you would set a goal that allows you to go far step-by-step — only stopping when you
clearly need me (the user) for requirements or goal-setting, or when you are SEVERELY blocked, and
otherwise using your tools, skills, sub-agents, and advisor smartly and wisely to get
forward — what would that goal be?

Rules for the goal you propose:
- Keep the goal definition itself light: a short, plain-language end state of at most
  500 characters (the /focus-goal-start limit) — not a task list.
- Keep the detail in files, per this repo's documentation standard: write the
  description, plan, and status down in files, and reference them from the goal.
- Present exactly one proposed goal definition, on a single line, ready to paste into
  /focus-goal-start, followed by a short rationale.
```

> The first paragraph is the user's own draft contract (amended "need me (the user)"
> at sign-off); the rules block encodes requirements 2–4, with the documentation
> standard kept repo-agnostic on purpose — each repo's standard can differ.

## What the feature must NOT do

- Must not set, start, submit, end, or otherwise modify the goal — only propose.
- Must not parse or validate the LLM's proposed text; length/emptiness enforcement
  stays in `/focus-goal-start` / `/focus-goal-start-submit`.
- Must not add goal persistence or cross-check behavior (goal-loop territory).

## Acceptance criteria (behavioral)

- `/focus-goal-suggest` (no args) triggers exactly one agent turn driven by the §Prompt
  text; the prompt appears in the transcript verbatim.
- The LLM's reply contains one single-line goal definition ≤500 chars plus a rationale;
  the definition passes `/focus-goal-start` validation unchanged.
- Suggest leaves goal state untouched: no active goal is created, the goal-loop
  cross-check is not armed, and `/focus-goal` still reports the previous state.
- While the agent is busy, the suggest prompt is queued as a follow-up (same as the
  submit variant), not lost.
- No arguments are accepted or parsed; `/focus-goal-suggest anything` behaves identically.

## Resolved (2026-10-11, user decisions)

1. **Home repo** — pi-focus-guard; part of the goal-loop command family
   (`/focus-goal-start`, `/focus-goal-start-submit`, `/focus-goal-end`, `/focus-goal`,
   now `/focus-goal-suggest`).
2. **Trigger** — no-argument command; emits a fixed prompt to the LLM.
3. **Prompt contract** — user's draft contract (step-by-step autonomy; stop only for
   requirements/goal-setting or severe blockage; use tools/skills/sub-agents/advisor
   wisely) plus: keep the goal light, detail (description/plan/status) in files per the
   repo documentation standard, definition max length per the goal-start rule (500).
4. **Adoption is explicit** — the user starts the goal with an existing command;
   suggest never arms the cross-check.
5. **Prompt wording** — signed off by the user, 2026-10-11 (repo-agnostic standard line,
   "need me (the user)"). Settled in `3_plan__goal-suggest.md` as `GOAL_SUGGEST_PROMPT`.
6. **Emission mechanism** — user-role message via `pi.sendUserMessage` (settled in the
   plan; same routing as `/focus-goal-start-submit`).
