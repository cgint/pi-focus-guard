# Focus Guard Feature Specifications

[← Back to README](../README.md)

Detailed behavioral specifications, configuration hierarchies, lifecycle rules, and enforcement mechanics for `pi-focus-guard`.

---

## Write Guard

Controls where filesystem modifications may occur during an agent turn. Denied writes are treated as policy boundaries rather than technical errors to work around.

### Commands & Flags
* `/focus-write-guard <dirs>` — Sets the session allowlist (comma- or space-separated paths, relative to cwd or absolute).
* `/focus-write-guard` — Displays the active write policy and resolved directories.
* `/focus-write-guard all` or `/focus-write-guard-all` — Disables write restrictions for the active session.
* `--write-guard <dirs>` — Startup flag setting the initial allowlist.
* `--write-guard-all` / `--write-guard-off` — Startup flag disabling write restrictions (overrides persisted state).

### Policy Resolution & Precedence
The effective policy is evaluated at session start or whenever a command updates session state:
1. **Explicit startup flag `--write-guard-off` / `--write-guard-all`:** Disables enforcement immediately (`source: session(off)`).
2. **Session override:** Set via `/focus-write-guard <dirs>` (`source: session`) or `/focus-write-guard all` (`source: session(off)`).
3. **Startup flag `--write-guard <dirs>`:** Validated on startup (`source: flag`).
4. **Environment variable `PI_WRITE_GUARD_DIRS`:** Comma-separated list (`source: env`).
5. **Project configuration `.pi/settings.json`:** Reads `allowedDirs` from keys `piWriteGuard`, `piWritePermit`, `writePolicy`, or legacy `writeAllowDirs` (`source: settings`).
6. **Default:** Unconfigured (`enforce: false`, `source: none`).

### Fail-Fast Configuration Validation
An explicitly configured allowlist must contain at least one valid directory:
* An empty `--write-guard`, an empty `PI_WRITE_GUARD_DIRS`, or an empty `allowedDirs` list in `.pi/settings.json` triggers a `WriteGuardConfigError` at session start.
* Malformed JSON or non-array `allowedDirs` in `.pi/settings.json` triggers an immediate configuration error.
* Every explicit configuration source is validated, even if a higher-priority source would have taken precedence.
* When invalid configuration is detected at startup, Pi notifies the user, logs the error, and calls `ctx.shutdown()` so interactive/RPC sessions close cleanly instead of operating with ambiguous write policies.

### Enforcement Mechanics
Write guard intercepts `tool_call` events:
* **`write` and `edit` tools:** The target path is normalized and canonicalized via `realpath`. If the canonical target is not inside one of the resolved allowed directories, the call is blocked.
* **`bash` tool:** Analyzes commands via AST parsing (`unbash`). Detects write-capable operations:
  * File redirections (`>`, `>>`, `&>`, `1>`, `2>`).
  * Destructive or mutating commands (`rm`, `mv`, `cp`, `mkdir`, `touch`, `sed -i`, `truncate`, `tee`, etc.).
  * Dynamic or unresolvable targets (e.g. dynamic variable paths) are blocked conservatively.
  * Always-safe targets (such as `/dev/null`) are permitted.
  * Commands writing outside the allowlist are blocked with clear, collaborative explanation messages.

### Footer Status Indicator
* `✍️` — Write guard is OFF (no write restrictions).
* `🔰` — Write guard is active, restricted strictly to the project directory (`cwd`).
* `🛡️` — Write guard is active, restricted to custom allowed directories.

---

## Discuss Mode

Controls agent agency and tool execution to enforce conversational alignment before actions are taken.

### Modes
1. **`off` (Standard Mode):** All tools are allowed according to standard guard policies.
2. **`block` (Conceptual Alignment):** All tool calls are blocked. Intended for stepping back from execution to discuss ideas, architecture, and goals.
3. **`read` (Read-Only Investigation):** Permits inspection and discovery without filesystem changes.
   * `write` and `edit` tool calls are strictly blocked.
   * `bash` commands are inspected via AST analysis (`unbash`) and permitted **only** when classified as strictly read-only (e.g. `ls`, `cat`, `git status`, `git log`, `grep`). Commands with potential mutation, redirection, or unverified side effects are blocked.
   * Read mode intentionally does **not** grant a temporary scratch-write exception.
   * Permissive with all other tools: session-local tools, extensions, web search, transcript inspection, subagents, and advisors are allowed.

### Commands & Startup Flags
* `/focus-discuss off | block | read` — Switches discussion mode for the current session.
* `/focus-discuss` — Displays the active discuss mode.
* `/focus-discuss-off` — Shortcut for `/focus-discuss off`.
* `/focus-discuss-block` — Shortcut for `/focus-discuss block`.
* `/focus-discuss-read` — Shortcut for `/focus-discuss read`.
* `--dm-off` — Starts session with discuss mode disabled; overrides persisted state.
* `--dm-block` — Starts session in block mode (`shortcut for --discuss-mode block`).
* `--dm-read` — Starts session in read-only mode (`shortcut for --discuss-mode read`).

### Inline Input Directives
Discuss mode can be updated inline when submitting a user prompt using leading or trailing directives:
* `-do:` — Disables discuss mode (`off`).
* `-db:` — Sets discuss mode to `block`.
* `-dr:` — Sets discuss mode to `read`.

Example:
```text
-dr: investigate why the build failed in CI
```
Or at the end:
```text
Please analyze this issue.
-dr:
```
* **Lifecycle & Queuing:** The directive is stripped from the prompt before model processing. If submitted during an active agent turn (follow-up queue), the directive is deferred and activates at the start of that queued turn.
* **Single Directive Rule:** Only one directive is permitted per message; multiple directives trigger a warning without changing state.
* **Directive-Only Prompts:** A message containing only a directive (e.g. `-dr:`) updates the mode immediately without starting an agent turn.

### Persistence & Tombstones
* Explicit transitions to `block` or `read` persist the mode to session history.
* Explicit transitions to `off` (`--dm-off`, `/focus-discuss-off`, or `-do:`) append an `off` tombstone entry.
* On session resume, the last persisted state wins: an explicit `off` tombstone prevents a session from resurrecting a prior discuss mode.

### Footer Status Indicator
* `✅` — Discuss mode is OFF (tools enabled).
* `🔒` — Discuss mode is BLOCK (all tools blocked).
* `📖` — Discuss mode is READ-ONLY (inspection tools and read-only bash allowed).

---

## Commit Guard

Prevents premature git commits during collaborative review and finishing phases.

### Goal & Intent
Commit guard is a collaboration signal, not a security boundary. It keeps the agent from finalizing milestones with `git commit` until the human collaborator has reviewed the diff, agreed on changes, and explicitly signaled readiness.

### Commands & Flags
* `/focus-commit-guard` — Displays commit guard status.
* `/focus-commit-guard-on` — Enables commit guard.
* `/focus-commit-guard-off` — Disables commit guard.
* `--commit-guard` / `--commit-guard-on` — Starts session with commit guard enabled.
* `--commit-guard-off` — Starts session with commit guard disabled (overrides persisted state).

### Enforcement Mechanics
* Runs on `tool_call` when `event.toolName === "bash"`.
* Inspects the command string for `git commit`.
* If detected and enabled, blocks execution with a message instructing the agent to finish collaborative review with `git diff` first and ask before committing.
* Hoisted above discuss-mode checking so git commit attempts are clearly identified with commit-guard guidance even in read-only discuss mode.

### Footer Status Indicator
* `📝` — Commit guard is OFF (commits allowed).
* `🚫` — Commit guard is ON (commits blocked).

---

## Crazy-Find Guard

Guards against runaway, unrestricted filesystem scans that scan `/` or the user's home directory.

### Goal & Intent
AI agents frequently run open-ended `find / ...` or `find ~ ...` commands looking for missing files, which can stall the agent, trigger permission denials, scan huge external drives, or consume massive memory. Crazy-find guard blocks these while keeping project-scoped finds completely unrestricted.

### Commands & Flags
* `/focus-crazy-find-guard` — Displays crazy-find guard status.
* `/focus-crazy-find-guard-on` — Enables crazy-find guard.
* `/focus-crazy-find-guard-off` — Disables crazy-find guard.
* `--crazy-find-guard` / `--crazy-find-guard-on` — Starts session with crazy-find guard enabled.
* `--crazy-find-guard-off` — Starts session with crazy-find guard disabled.

### Defaults & Scoping
* **Default:** ON for all fresh sessions.
* **Persistence:** Persists explicit toggles in session history. Default ON is not persisted as session clutter.
* **Target Detection:** Parses bash AST (`unbash`) to find starting paths passed to `find`. Handles wrappers like `sudo`, `env`, `nohup`, and `command`.
* **Blocked Paths:**
  * Root path `/` (e.g. `find / -name "*.ts"`).
  * Home directory `~`, `$HOME`, or the user's absolute home directory path.
* **Allowed Paths:**
  * Project-relative or subdirectory paths (e.g. `find .`, `find ./src`, `find ~/dev/project`, `find /tmp`).
* If even one command in a chained pipeline (e.g. `find ./src; find / -name "test"`) targets `/` or `~`, the entire bash call is blocked with guidance to narrow the search scope.

### Footer Status Indicator
* *(None)* — Kept out of the bottom status bar to maintain a clean TUI status area.

---

## Goal Loop

Session-scoped end-state anchoring with turn-end cross-checking and autonomous nudging.

### Goal & Intent
Keeps long-running, multi-step agent tasks aligned with an explicit objective. Instead of releasing control prematurely after completing one sub-task, the goal loop nudges the agent at the end of each turn to self-evaluate whether the goal is genuinely achieved.

### Commands
* `/focus-goal-start <definition>` — Validates and arms the session goal (plain string, max 500 characters). Emits an informational message to the model without starting an agent turn.
* `/focus-goal-start-submit <definition>` — "Arm and go" form: validates and arms the goal, then immediately submits `<definition>` as a user prompt to trigger an agent turn.
  * Idle session $\rightarrow$ sent immediately as a new turn.
  * Busy session $\rightarrow$ queued as a follow-up (`deliverAs: "followUp"`).
  * Prompt template expansion is disabled (`expandPromptTemplates: false`) so the goal text passes through verbatim.
* `/focus-goal-suggest` — Asks the agent to propose a single session goal:
  * Emits a standardized system prompt asking for a single-line definition ($\le 500$ chars) with details referenced in files per repo standards.
  * Suggestion only — does not arm or mutate any goal state. The user can adopt it with `/focus-goal-start` or `/focus-goal-start-submit`.
  * Same idle-aware routing as submit (`sendUserMessage`).
* `/focus-goal-end` — Disarms and removes the active goal without rendering a pass/fail judgment.
* `/focus-goal` — Prints the active goal definition, or informs that none is active.

### Turn-End Cross-Check Mechanics
1. When an agent turn finishes (`agent_end`) and an active goal is set:
2. The extension sends a steering nudge message carrying the exact goal description:
   ```text
   [goal-reminder] active goal: "<definition>"
     → cross-check: is this goal genuinely reached? if not, keep working;
     if it is, release to the user. (extension nudge, not user input)
   ```
3. Delivered as `steer` with `triggerTurn: true`.
4. A re-entrancy latch (`isNudging`) prevents the steer turn itself from triggering runaway looping; the latch is cleared when the agent settled (`agent_settled`) or on `session_start`.
5. The agent independently judges whether the goal is reached: if achieved, it releases back to the user; if incomplete, it continues working.

### Lifecycle & Persistence
* The goal is **strictly session-scoped**: stored in module memory and cleared on session restart or end.
* It does not persist to disk, history, or `.pi/settings.json`.

### Footer Status Indicator
* `🎯` — Goal is active.
* *(Cleared / empty slot)* — No goal active.
