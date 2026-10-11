# Write Guard

[← Back to Main README](../../README.md) · [Feature Index](README.md)

Write guard controls where filesystem modifications may occur during an agent turn. Denied writes are framed as policy boundaries rather than technical errors to work around.

---

## Commands & Flags

| Command / Flag | Description |
| :--- | :--- |
| `/focus-write-guard <dirs>` | Set the session allowlist (comma- or space-separated paths, relative to cwd or absolute) |
| `/focus-write-guard +<dir> [-<dir> …]` | Incrementally add (`+`) and/or remove (`-`) directories from the active allowlist; see [Incremental edit](#incremental-edit) |
| `/focus-write-guard` | Display the active write policy and resolved directories |
| `/focus-write-guard-all` | Disable write restrictions for the active session |
| `--write-guard <dirs>` | Startup flag setting the initial allowlist |
| `--write-guard-all` / `--write-guard-off` | Startup flag disabling write restrictions (overrides persisted state) |

---

## Incremental edit

Any token prefixed with `+` or `-` switches `/focus-write-guard` to **edit mode**: instead of replacing the whole list, adds/removes are applied left-to-right to the currently effective allowlist (whatever source is active). Plain, unprefixed tokens always mean **set mode** (replace the whole list) — mixing the two is rejected as ambiguous, and a bare `+`/`-` with no directory is an error.

* **`+<dir>`** adds the directory; duplicates (by resolved path) are no-ops. Adding while the guard is off turns the guard on with the added dir(s).
* **`-<dir>`** removes the directory, matching by resolved path (so `-docs`, `-./docs`, and `-docs/` all remove a stored `./docs`). Removing a dir that is not in the list is a no-op with a notice naming the dir.
* **Removing the last remaining directory is disallowed**: the list is left unchanged and a warning is shown pointing to the two exits — `/focus-write-guard-all` (disable) or `/focus-write-guard <dirs>` (set a new non-empty list). An empty allowlist is not a valid state in this codebase.
* The result is stored as a session override and persists across session restart, exactly like set mode.
* Known limitation: there is no way to add or remove a directory whose name itself starts with `-`.

---

## Policy Resolution & Precedence

The effective policy is evaluated at session start or whenever a command updates session state:
1. **Explicit startup flag `--write-guard-off` / `--write-guard-all`:** Disables enforcement immediately (`source: session(off)`).
2. **Session override:** Set via `/focus-write-guard <dirs>` (`source: session`) or disabled via `/focus-write-guard-all` (`source: session(off)`).
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
