# Request (20261011_163846)

```
Review the changes in the attached diff file against the full codebase context and any relevant OpenSpec artifacts. Focus only on the regions that appear in the diff — use the surrounding codebase and OpenSpec artifacts for context, not as additional review targets.

For each changed region, evaluate:
1. **Correctness**: Does the change do what it claims? Are there off-by-one errors, missing edge cases, or logic bugs?
2. **Side effects**: Does the change break anything downstream? Check callers, imports, tests, and related files.
3. **Spec alignment**: If an OpenSpec change is involved, does the diff fulfill the spec requirements and task checklist?
4. **Security**: Any auth bypass, injection, path traversal, info leak, or credential exposure introduced by the change?
5. **Test coverage**: Are the changes covered by tests? If not, what should be tested?

Only report real issues — not style preferences or linter noise. Cite exact file and line for each finding.


**Additional focus:** Feature: /focus-goal-suggest (5th goal-loop command; requirements+plan in untracked docs/feature-impl/20261011-goal-suggest/. Review focus: src/goal/goal.ts new GOAL_SUGGEST_PROMPT + focus-goal-suggest registration (suggest-only, no goal-state side effects, idle/busy sendUserMessage routing), test coverage in test/goal-loop.test.ts + focus-guard invariant, README command lists. Verify against the settled requirements: no args, no side effects, prompt contract (user stop-triggers, repo-agnostic standard line, 500-char rule, single-line definition).

```

# Response

### Overview

The diff implements the `/focus-goal-suggest` command—the 5th command of the goal-loop subsystem—which requests the agent to propose an adoptable session goal without modifying any goal state. The implementation spans `src/goal/goal.ts`, `README.md`, `test/focus-guard.test.ts`, and `test/goal-loop.test.ts`.

---

### Evaluation by Changed Region

#### 1. `src/goal/goal.ts` (Lines 6–28, 57, 142–156 in diff)

- **`GOAL_SUGGEST_PROMPT` constant (Lines 11–32 in file):**
  - **Confirmed:** Matches verbatim the prompt signed off in `docs/feature-impl/20261011-goal-suggest/2_requirements__goal-suggest.md` §Prompt text.
  - **Contract checks:**
    - User stop-triggers: `"clearly need me (the user) for requirements or goal-setting, or when you are SEVERELY blocked"`
    - Broad agent autonomy: `"otherwise using your tools, skills, sub-agents, and advisor smartly and wisely to get forward"`
    - Repo-agnostic documentation standard: `"per this repo's documentation standard: write the description, plan, and status down in files, and reference them from the goal"` (no hardcoded path like `docs/feature-impl/`).
    - 500-character constraint: `"at most 500 characters (the /focus-goal-start limit)"`
    - Single-line format: `"Present exactly one proposed goal definition, on a single line, ready to paste into /focus-goal-start, followed by a short rationale."`
  - Exported so unit tests assert against the identical string that production code sends.

- **Command Registration `/focus-goal-suggest` (Lines 142–156 in file):**
  - **Args handling:** Handler takes `(_args, ctx)` and ignores arguments, satisfying the requirement that `/focus-goal-suggest` takes no arguments and behaves identically regardless of any extra input.
  - **State isolation:** Suggestion-only contract is preserved. The handler does not touch `activeGoal`, `isNudging`, UI status, or call `startGoal()`.
  - **Message routing:** 
    - Idle (`ctx.isIdle()`): invokes `pi.sendUserMessage(GOAL_SUGGEST_PROMPT, { expandPromptTemplates: false })`.
    - Busy: queues the prompt with `{ deliverAs: "followUp", expandPromptTemplates: false }`.
    - Template expansion is explicitly disabled, matching the established pattern in `/focus-goal-start-submit`.

---

#### 2. `README.md` (Lines 54, 153, 162 in diff)

- **Confirmed:** Adds `/focus-goal-suggest` to both global command listings (`Lines 54`, `153`) and provides a concise description under the Goal loop section (`Line 162`).
- **Accuracy:** Clarifies that the command is suggestion-only, never starts or arms a goal, routes via user-role messages with idle/busy awareness, and points to `/focus-goal-start` or `/focus-goal-start-submit` for adoption.

---

#### 3. `test/focus-guard.test.ts` (Line 88 in diff)

- **Confirmed:** Adds `"focus-goal-suggest"` to the expected array in `focus command surface > registers only focus-prefixed user commands`.
- **Alphabetical ordering:** Properly maintained (`focus-goal-start-submit` < `focus-goal-suggest` < `focus-write-guard`).

---

#### 4. `test/goal-loop.test.ts` (Lines 3, 78, 95, 325–379 in diff)

- **Command Registration (Lines 78, 95):**
  - Updated assertion count to 5 commands (`focus-goal`, `focus-goal-end`, `focus-goal-start`, `focus-goal-start-submit`, `focus-goal-suggest`).
  - Added existence check for `fullPi._commands.get("focus-goal-suggest")` when wired via `focusGuard()`.
- **Dedicated Test Suite `describe("goal-loop /focus-goal-suggest")`:**
  - **Idle routing:** Asserts immediate dispatch via `pi.sendUserMessage` with `{ expandPromptTemplates: false }` and without `deliverAs`.
  - **Busy routing:** Asserts queued follow-up via `pi.sendUserMessage` with `{ deliverAs: "followUp", expandPromptTemplates: false }`.
  - **Argument invariance:** Verifies that passing arbitrary arguments produces an identical prompt dispatch.
  - **Prompt contract verification:** Asserts key contract tokens (`need me (the user)`, `SEVERELY blocked`, `this repo's documentation standard`, `500 characters`, `/focus-goal-start`) and confirms absence of hardcoded repo paths (`docs/feature-impl`).
  - **Zero side-effect verification:** Confirms `getActiveGoal()` remains `null`, `pi.sendMessage` (custom messages) is not called, `ctx.ui.setStatus` is untouched, and triggering `agent_end` produces no nudges.

---

### Evaluation Criteria

1. **Correctness**:
   - The implementation adheres strictly to the settled prompt text and routing logic.
   - Ignores arguments as specified.
   - Does not mutate session goal state or arm the turn-end nudge.
2. **Side effects**:
   - None. Existing commands (`/focus-goal-start`, `/focus-goal-start-submit`, `/focus-goal-end`, `/focus-goal`) and turn-end nudge cross-check behavior remain unaffected.
3. **Spec alignment**:
   - Fully aligned with `docs/feature-impl/20261011-goal-suggest/2_requirements__goal-suggest.md` and `3_plan__goal-suggest.md`.
4. **Security**:
   - Prompt templates and skill expansions are disabled via `expandPromptTemplates: false`.
   - The prompt string is constant and immutable, precluding prompt injection via arguments.
5. **Test coverage**:
   - Complete coverage for all execution paths (idle send, busy queue, argument invariance, contract verification, and state isolation).

---

### Findings

No bugs, security regressions, or spec misalignments were found in the diff. The implementation fulfills all requirements cleanly.

## Token Usage

🔢 **Model**: gemini-3.8-flash

📊 Token Usage
  ├─ Prompt:    89627
  ├─ Response:  1466
  ├─ Thoughts:  5923
  └─ Total:     97016

## Generated Files

* Context: .codegiant/20261011_163846_codegiant_context.md
* Raw Output: .codegiant/20261011_163846_codegiant_llm_raw_output.json
* Response: .codegiant/20261011_163846_codegiant_llm_response.md
