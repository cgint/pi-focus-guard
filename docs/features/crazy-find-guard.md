# Crazy-Find Guard

[← Back to Main README](../../README.md) · [Feature Index](README.md)

Crazy-find guard protects the session against runaway, unrestricted filesystem scans rooted at `/` or user home (`~`).

---

## Goal & Intent

AI agents frequently run open-ended `find / ...` or `find ~ ...` commands looking for missing files, which can stall the agent, trigger permission denials, scan huge external drives, or consume massive memory. Crazy-find guard blocks these while keeping project-scoped finds completely unrestricted.

---

## Commands & Flags

| Command / Flag | Description |
| :--- | :--- |
| `/focus-crazy-find-guard` | Display crazy-find guard status |
| `/focus-crazy-find-guard-on` | Enable crazy-find guard |
| `/focus-crazy-find-guard-off` | Disable crazy-find guard |
| `--crazy-find-guard` / `-on` | Start session with crazy-find guard enabled |
| `--crazy-find-guard-off` | Start session with crazy-find guard disabled |

---

## Defaults & Scoping

* **Default:** ON for all fresh sessions.
* **Persistence:** Explicit toggles via command or flag are persisted in session history. The initial default ON is not persisted to avoid session clutter.
* **AST Target Detection:** Parses bash AST (`unbash`) to inspect starting paths passed to `find`. Handles command wrappers like `sudo`, `env`, `nohup`, and `command`.
* **Blocked Paths:**
  * Root path `/` (e.g. `find / -name "*.ts"`).
  * Home directory `~`, `$HOME`, or the user's absolute home directory path.
* **Allowed Paths:**
  * Project-relative or subdirectory paths (e.g. `find .`, `find ./src`, `find ~/dev/project`, `find /tmp`).
* **Pipeline Protection:** If even one command in a chained pipeline (e.g. `find ./src; find / -name "test"`) targets `/` or `~`, the entire bash call is blocked with guidance to narrow the search scope.

---

## Footer Status Indicator

* *(None)* — Kept out of the bottom status bar to maintain a clean TUI status area.
