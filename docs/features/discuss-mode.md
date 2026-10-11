# Discuss Mode

[← Back to Main README](../../README.md) · [Feature Index](README.md)

Discuss mode controls agent agency and tool execution to enforce conversational alignment before actions are taken.

---

## Modes

1. **`off` (Standard Mode):**
   * All tools are allowed according to standard guard policies.
2. **`block` (Conceptual Alignment):**
   * All tool calls are blocked.
   * Intended for strictly stepping back from execution to discuss ideas, architecture, and goals.
3. **`read` (Read-Only Investigation):**
   * Permits inspection and discovery without filesystem changes.
   * `write` and `edit` tool calls are strictly blocked.
   * `bash` commands are inspected via AST analysis (`unbash`) and permitted **only** when classified as strictly read-only (e.g. `ls`, `cat`, `git status`, `git log`, `grep`). Commands with potential mutation, redirection, or unverified side effects are blocked.
   * Read mode intentionally does **not** grant a temporary scratch-write exception.
   * Permissive with all other tools: session-local tools, extensions, web search, transcript inspection, subagents, and advisors are allowed.

---

## Commands & Startup Flags

| Command / Flag | Description |
| :--- | :--- |
| `/focus-discuss off\|block\|read` | Switch discussion mode for the current session |
| `/focus-discuss` | Display the active discuss mode status |
| `/focus-discuss-off` | Shortcut for `/focus-discuss off` |
| `/focus-discuss-block` | Shortcut for `/focus-discuss block` |
| `/focus-discuss-read` | Shortcut for `/focus-discuss read` |
| `--dm-off` | Start session with discuss mode disabled (overrides persisted state) |
| `--dm-block` | Start session in block mode (`shortcut for --discuss-mode block`) |
| `--dm-read` | Start session in read-only mode (`shortcut for --discuss-mode read`) |

---

## Inline Input Directives

Discuss mode can be updated inline when submitting a user prompt using leading or trailing directives:
* `-do:` — Disables discuss mode (`off`).
* `-db:` — Sets discuss mode to `block`.
* `-dr:` — Sets discuss mode to `read`.

### Examples
```text
-dr: investigate why the build failed in CI
```
Or trailing:
```text
Please analyze this issue.
-dr:
```

### Lifecycle & Queuing Rules
* **Directive Stripping:** The directive prefix/suffix is stripped before the prompt reaches the model.
* **Queued Follow-ups:** If submitted while the agent is streaming an active turn, the directive is deferred and activates at the start of that queued turn.
* **Single Directive Rule:** Only one directive is permitted per message; multiple directives trigger a warning without changing state.
* **Directive-Only Prompts:** A message containing only a directive (e.g. `-dr:`) updates the mode immediately without starting an agent turn.

---

## Persistence & Tombstone Semantics

* Explicit transitions to `block` or `read` persist the mode to session history.
* Explicit transitions to `off` (`--dm-off`, `/focus-discuss-off`, or `-do:`) append an `off` tombstone entry.
* On session resume, the last persisted state wins: an explicit `off` tombstone prevents a resumed session from resurrecting a prior discuss mode.
* The implicit default off mode is not persisted to avoid history clutter.

---

## Footer Status Indicator

* `✅` — Discuss mode is OFF (tools enabled).
* `🔒` — Discuss mode is BLOCK (all tools blocked).
* `📖` — Discuss mode is READ-ONLY (inspection tools and read-only bash allowed).
