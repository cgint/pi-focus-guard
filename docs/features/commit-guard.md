# Commit Guard

[← Back to Main README](../../README.md) · [Feature Index](README.md)

Commit guard prevents premature git commits during collaborative review and finishing phases.

---

## Goal & Intent

Commit guard is a collaboration signal, not a security boundary. It keeps the agent from finalizing milestones with `git commit` until the human collaborator has reviewed the diff, agreed on changes, and explicitly signaled readiness to commit.

---

## Commands & Flags

| Command / Flag | Description |
| :--- | :--- |
| `/focus-commit-guard` | Display commit guard status |
| `/focus-commit-guard-on` | Enable commit guard |
| `/focus-commit-guard-off` | Disable commit guard |
| `--commit-guard` / `-on` | Start session with commit guard enabled |
| `--commit-guard-off` | Start session with commit guard disabled (overrides persisted state) |

---

## Enforcement Mechanics

* Intercepts `tool_call` events when `event.toolName === "bash"`.
* Inspects the command string for `git commit`.
* If detected and enabled, blocks execution with a message instructing the agent to finish collaborative review with `git diff` first and ask before committing.
* Hoisted above discuss-mode checking so git commit attempts are clearly identified with commit-guard guidance even in read-only discuss mode.

---

## Footer Status Indicator

* `📝` — Commit guard is OFF (commits allowed).
* `🚫` — Commit guard is ON (commits blocked).
