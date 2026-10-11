# Write Guard

[← Back to Main README](../../README.md) · [Feature Index](README.md)

Write guard controls where filesystem modifications may occur during an agent turn. Denied writes are framed as policy boundaries rather than technical errors to work around.

---

## Commands & Flags

| Command / Flag | Description |
| :--- | :--- |
| `/focus-write-guard <dirs>` | Set the session allowlist (comma- or space-separated paths, relative to cwd or absolute) |
| `/focus-write-guard` | Display the active write policy and resolved directories |
| `/focus-write-guard all` / `-all` | Disable write restrictions for the active session |
| `--write-guard <dirs>` | Startup flag setting the initial allowlist |
| `--write-guard-all` / `--write-guard-off` | Startup flag disabling write restrictions (overrides persisted state) |

---

## Policy Resolution & Precedence

The effective policy is evaluated at session start or whenever a command updates session state:
1. **Explicit startup flag `--write-guard-off` / `--write-guard-all`:** Disables enforcement immediately (`source: session(off)`).
2. **Session override:** Set via `/focus-write-guard <dirs>` (`source: session`) or `/focus-write-guard all` (`source: session(off)`).
3. **Startup flag `--write-guard <dirs>`:** Validated on startup (`source: flag`).
4. **Environment variable `PI_WRITE_GUARD_DIRS`:** Comma-separated list (`source: env`).
5. **Project configuration `.pi/settings.json`:** Reads `allowedDirs` from keys `piWriteGuard`, `piWritePermit`, `writePolicy`, or legacy `writeAllowDirs` (`source: settings`).
6. **Default:** Unconfigured (`enforce: false`, `source: none`).

---

## Fail-Fast Configuration Validation

An explicitly configured allowlist must contain at least one valid directory:
* An empty `--write-guard`, an empty `PI_WRITE_GUARD_DIRS`, or an empty `allowedDirs` list in `.pi/settings.json` triggers a `WriteGuardConfigError` at session start.
* Malformed JSON or non-array `allowedDirs` in `.pi/settings.json` triggers an immediate configuration error.
* Every explicit configuration source is validated, even if a higher-priority source would have taken precedence.
* When invalid configuration is detected at startup, Pi notifies the user, logs the error, and calls `ctx.shutdown()` so interactive/RPC sessions close cleanly instead of operating with ambiguous write policies.

---

## Enforcement Mechanics

Write guard intercepts `tool_call` events:
* **`write` and `edit` tools:** The target path is normalized and canonicalized via `realpath`. If the canonical target is not inside one of the resolved allowed directories, the call is blocked.
* **`bash` tool:** Analyzes commands via AST parsing (`unbash`). Detects write-capable operations:
  * File redirections (`>`, `>>`, `&>`, `1>`, `2>`).
  * Destructive or mutating commands (`rm`, `mv`, `cp`, `mkdir`, `touch`, `sed -i`, `truncate`, `tee`, etc.).
  * Dynamic or unresolvable targets (e.g. dynamic variable paths) are blocked conservatively.
  * Always-safe targets (such as `/dev/null`) are permitted.
  * Commands writing outside the allowlist are blocked with clear, collaborative explanation messages.

---

## Footer Status Indicator

* `✍️` — Write guard is OFF (no write restrictions).
* `🔰` — Write guard is active, restricted strictly to the project directory (`cwd`).
* `🛡️` — Write guard is active, restricted to custom allowed directories.
