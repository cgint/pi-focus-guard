# Request (20261011_162225)

```
Review the changes in the attached diff file against the full codebase context and any relevant OpenSpec artifacts. Focus only on the regions that appear in the diff — use the surrounding codebase and OpenSpec artifacts for context, not as additional review targets.

For each changed region, evaluate:
1. **Correctness**: Does the change do what it claims? Are there off-by-one errors, missing edge cases, or logic bugs?
2. **Side effects**: Does the change break anything downstream? Check callers, imports, tests, and related files.
3. **Spec alignment**: If an OpenSpec change is involved, does the diff fulfill the spec requirements and task checklist?
4. **Security**: Any auth bypass, injection, path traversal, info leak, or credential exposure introduced by the change?
5. **Test coverage**: Are the changes covered by tests? If not, what should be tested?

Only report real issues — not style preferences or linter noise. Cite exact file and line for each finding.

```

# Response

### Overview

The diff implements the `/focus-goal-start-submit <definition>` command ("arm and go" variant of `/focus-goal-start`) across implementation, documentation, and tests.

---

### Changed Regions Analysis

#### 1. `src/goal/goal.ts` (Lines 31–36, 95–120 in diff)

- **Correctness**:
  - Input validation: Trims `args` and validates `!definition` and `definition.length > GOAL_MAX_LENGTH` (500) before any state change or message dispatch, matching `/focus-goal-start`.
  - State mutation: Reuses `startGoal(definition, ctx)` to set `activeGoal`, update status indicator (`⭕`), notify the UI, and inform the agent.
  - Idle-aware submission: Checks `ctx.isIdle()`. If idle, submits via `pi.sendUserMessage(definition, { expandPromptTemplates: false })`. If busy, queues via `pi.sendUserMessage(definition, { deliverAs: "followUp", expandPromptTemplates: false })`.
  - **Defensive API call observation**: `ctx.isIdle()` is invoked directly (`src/goal/goal.ts:111`). Per `docs/feature-impl/20261020-goal-loop/5_implementation__goal-loop.md:88`, `isIdle(): boolean` exists on `ExtensionContext` in Pi 1.1.0. Note that in mock contexts or environments where `isIdle` is omitted (e.g. `createCtx` in `test/focus-guard.test.ts:44`), calling this handler would throw a `TypeError: ctx.isIdle is not a function`. Using optional chaining / fallback (`ctx.isIdle?.() ?? true`) would be more resilient in test harnesses.
- **Side effects**:
  - None. Existing commands (`/focus-goal-start`, `/focus-goal-end`, `/focus-goal`) and turn-end nudge handlers are unchanged.
- **Spec alignment**:
  - Aligns with `docs/feature-impl/20261020-goal-loop/2_requirements__goal-loop.md` (Requirements 1, 2b, 9): passes text verbatim, disables template expansion (`expandPromptTemplates: false`), arms cross-check, and submits idle/follow-up accordingly.
- **Security**:
  - No prompt injection or command expansion risks: `expandPromptTemplates: false` prevents prompt-template or skill parsing. Input length is capped at 500 characters.
- **Test coverage**:
  - Covered in `test/goal-loop.test.ts` across idle submission, busy follow-up submission, length boundary (500 chars), validation rejection, and passive start regression.

---

#### 2. `test/focus-guard.test.ts` (Line 87 in diff)

- **Correctness**:
  - Adds `"focus-goal-start-submit"` to the expected array in `focus command surface > registers only focus-prefixed user commands`. Array remains sorted alphabetically.
- **Side effects**:
  - Prevents regression failures in the command enumeration test.
- **Spec alignment**:
  - Fulfills invariant that all user commands in the repo are `focus-` prefixed.

---

#### 3. `test/goal-loop.test.ts` (Lines 21–23, 38, 78–85, 93, 164–232 in diff)

- **Correctness**:
  - `createPiMock` updated with mock `sendUserMessage: vi.fn(...)`.
  - `createCtx` updated with `isIdle: vi.fn().mockReturnValue(true)`.
  - Registration tests updated to assert all 4 commands (`focus-goal`, `focus-goal-end`, `focus-goal-start`, `focus-goal-start-submit`).
  - Added 7 dedicated tests under `describe("goal-loop /focus-goal-start-submit")`:
    1. Arming parity with `/focus-goal-start` (active goal, UI status, notification, agent message).
    2. Idle submission without `deliverAs`.
    3. Busy submission with `deliverAs: "followUp"`.
    4. Empty string rejection before submission.
    5. >500 character rejection before submission.
    6. Exact 500 character acceptance and submission.
    7. Passive `/focus-goal-start` regression test ensuring `sendUserMessage` is not invoked.
- **Side effects**:
  - None. All pre-existing tests continue to pass.

---

#### 4. Documentation Diffs (`README.md`, `2_requirements__goal-loop.md`, `5_implementation__goal-loop.md`)

- **Correctness & Spec Alignment**:
  - `README.md`: Correctly documents the command, syntax, passive vs. active distinction, and routing behavior.
  - `2_requirements__goal-loop.md`: Requirements amended cleanly with submit variant details.
  - `5_implementation__goal-loop.md`:
    - Total test count updated from 190 to 197 (+7 tests), which is mathematically accurate.
    - *Minor documentation discrepancy*: Line 12 in `5_implementation__goal-loop.md` states: `"test/goal-loop.test.ts — 24 tests"`. The file actually contains **23 tests** (16 original + 7 new submit tests).

---

### Summary of Findings

| File | Line | Classification | Description |
|---|---|---|---|
| `docs/feature-impl/20261020-goal-loop/5_implementation__goal-loop.md` | 12 | Documentation typo | Mentions "24 tests" for `test/goal-loop.test.ts`, but the file contains 23 tests (16 original + 7 new tests = 23). |
| `src/goal/goal.ts` | 111 | Recommendation | `ctx.isIdle()` is invoked without fallback. While valid in Pi 1.1.0, `ctx.isIdle?.() ?? true` would prevent `TypeError` if invoked under lightweight test harnesses where `isIdle` is unmocked. |

## Token Usage

🔢 **Model**: gemini-3.8-flash

📊 Token Usage
  ├─ Prompt:    84576
  ├─ Response:  1415
  ├─ Thoughts:  23665
  └─ Total:     109656

## Generated Files

* Context: .codegiant/20261011_162225_codegiant_context.md
* Raw Output: .codegiant/20261011_162225_codegiant_llm_raw_output.json
* Response: .codegiant/20261011_162225_codegiant_llm_response.md
