# pi-focus-guard

Unified focus-related guard rails and collaboration controls for Pi under one clear `/focus-*` command family.

`pi-focus-guard` groups mode switching, filesystem boundaries, execution safeguards, and autonomous goal tracking into a single cohesive extension. Instead of cold security blockades, focus controls act as **semantic collaboration signals** that explain *why* boundaries exist, building mutual situational awareness between user and agent.

For our philosophy on agentic agency, boundaries as collaboration signals, and pairing discipline, see [`docs/philosophy-and-north-star.md`](docs/philosophy-and-north-star.md).

For deep behavioral specifications, AST detection mechanics, and configuration hierarchies, see [`docs/features.md`](docs/features.md).

---

## Feature Groups

### 🛡️ Write Guard
* **Goal & Intent:** Keep filesystem modifications confined to explicit, approved directories.
* **Why it matters:** Prevents agents from modifying files outside active task boundaries or writing across unrelated directories. Writes via `write`, `edit`, and shell redirections/mutations in `bash` are validated against the allowlist.
* **Key Commands:** `/focus-write-guard <dirs>`, `/focus-write-guard`, `/focus-write-guard-all`
* **Startup Flags:** `--write-guard <dirs>`, `--write-guard-all`, `--write-guard-off`
* 📖 *Full details:* [Write Guard in docs/features.md](docs/features.md#write-guard)

### 💬 Discuss Mode
* **Goal & Intent:** Explicitly control when the agent may execute actions versus when it should step back to discuss or investigate.
* **Why it matters:** Prevents eager execution before ideas are clear. Supports three distinct collaboration modes:
  * `off`: Normal execution.
  * `block`: Strictly steps back from all tools to discuss architecture, ideas, and trade-offs.
  * `read`: Permits non-mutating inspection (read-only `bash`, inspection tools, subagents, and advisors) while blocking all `write` and `edit` calls.
* **Key Commands:** `/focus-discuss off|block|read`, `/focus-discuss-off`, `/focus-discuss-block`, `/focus-discuss-read`
* **Startup Flags:** `--dm-off`, `--dm-block`, `--dm-read`
* **Inline Directives:** `-do:`, `-db:`, `-dr:` (switch mode directly inside a prompt)
* 📖 *Full details:* [Discuss Mode in docs/features.md](docs/features.md#discuss-mode)

### 🚫 Commit Guard
* **Goal & Intent:** Prevent premature git commits until collaborative review is finished.
* **Why it matters:** Keeps the agent from unilaterally committing changes while the user is still reviewing diffs, verifying edge cases, and deciding on milestones.
* **Key Commands:** `/focus-commit-guard`, `/focus-commit-guard-on`, `/focus-commit-guard-off`
* **Startup Flags:** `--commit-guard`, `--commit-guard-on`, `--commit-guard-off`
* 📖 *Full details:* [Commit Guard in docs/features.md](docs/features.md#commit-guard)

### 🧭 Crazy-Find Guard
* **Goal & Intent:** Shield the session from runaway filesystem scans rooted at `/` or user home (`~`).
* **Why it matters:** AI agents frequently launch unbounded `find /` or `find ~` commands that freeze sessions, hit permissions walls, or scan giant external volumes. Enabled by default, while project-scoped searches (e.g. `find .`, `find ./src`, `find ~/dev/repo`) remain completely unrestricted.
* **Key Commands:** `/focus-crazy-find-guard`, `/focus-crazy-find-guard-on`, `/focus-crazy-find-guard-off`
* **Startup Flags:** `--crazy-find-guard`, `--crazy-find-guard-on`, `--crazy-find-guard-off`
* 📖 *Full details:* [Crazy-Find Guard in docs/features.md](docs/features.md#crazy-find-guard)

### 🎯 Goal Loop
* **Goal & Intent:** Anchor multi-turn agent work to a clear session goal via turn-end cross-checking.
* **Why it matters:** Instead of stopping after a single preliminary step, an active session goal nudges the agent at the end of each turn to self-evaluate: *Is this goal genuinely reached? If not, keep working; if it is, release to the user.*
* **Key Commands:** `/focus-goal-start <def>`, `/focus-goal-start-submit <def>`, `/focus-goal-suggest`, `/focus-goal`, `/focus-goal-end`
* 📖 *Full details:* [Goal Loop in docs/features.md](docs/features.md#goal-loop)

---

## Quick Reference

### Commands Cheat-Sheet

| Command | Description |
| :--- | :--- |
| `/focus-write-guard <dirs>` | Set write allowlist for the current session (comma/space-separated) |
| `/focus-write-guard` | Display current write guard policy and allowed directories |
| `/focus-write-guard-all` | Disable write restrictions for this session |
| `/focus-discuss off\|block\|read` | Switch discuss mode (`off`, `block`, or `read`) |
| `/focus-discuss` | Display active discuss mode status |
| `/focus-discuss-off` | Disable discuss mode (allow all tools) |
| `/focus-discuss-block` | Block all tool calls (conceptual alignment) |
| `/focus-discuss-read` | Enter read-only mode (allow inspection tools & read-only bash) |
| `/focus-commit-guard` | Show commit guard status |
| `/focus-commit-guard-on` | Block `git commit` commands until review is complete |
| `/focus-commit-guard-off` | Allow `git commit` commands again |
| `/focus-crazy-find-guard` | Show crazy-find guard status |
| `/focus-crazy-find-guard-on` | Enable crazy-find guard (block `find /` and `find ~`) |
| `/focus-crazy-find-guard-off` | Disable crazy-find guard (allow unrestricted finds) |
| `/focus-goal-start <def>` | Arm turn-end goal cross-check without triggering an agent turn ($\le 500$ chars) |
| `/focus-goal-start-submit <def>` | Arm goal and immediately submit definition as user prompt to start work |
| `/focus-goal-suggest` | Ask the agent to propose a single adoptable session goal |
| `/focus-goal` | Print active goal definition, or state that none is active |
| `/focus-goal-end` | Disarm and clear active goal without judging completion |

### Startup Flags

| Flag | Description |
| :--- | :--- |
| `--write-guard <dirs>` | Start session with write allowlist set to comma-separated directories |
| `--write-guard-all` / `--write-guard-off` | Start session with write guard disabled (overrides persisted state) |
| `--dm-off` | Start session with discuss mode disabled (overrides persisted state) |
| `--dm-block` | Start session in discuss block mode (all tools blocked) |
| `--dm-read` | Start session in discuss read-only mode (inspection tools only) |
| `--commit-guard` / `--commit-guard-on` | Start session with commit guard enabled |
| `--commit-guard-off` | Start session with commit guard disabled |
| `--crazy-find-guard` / `--crazy-find-guard-on` | Start session with crazy-find guard enabled (default) |
| `--crazy-find-guard-off` | Start session with crazy-find guard disabled |

*Precedence:* Explicit `off` flags override on/read/block flags and persisted state for their respective guard.

### Inline Discuss Directives

Discuss mode can be changed inline when submitting a request:
* `-do: <message>` — Disable discuss mode and process message.
* `-db: <message>` — Set discuss mode to block and process message.
* `-dr: <message>` — Set discuss mode to read-only and process message.

Can be placed at the start or end of the prompt (e.g. `-dr: check why tests fail`). A directive-only message changes the mode without starting an agent turn. Follow-up queued directives activate when their turn begins.

### Status Bar Icon Legend

`pi-focus-guard` surfaces active guard states in the Pi footer status bar:

| Guard Area | Icon | Meaning |
| :--- | :---: | :--- |
| **Write Guard** | `✍️` | Write guard is **OFF** (no write restrictions) |
| | `🔰` | Write guard is active, restricted strictly to project `cwd` |
| | `🛡️` | Write guard is active, restricted to custom allowed directories |
| **Discuss Mode** | `✅` | Discuss mode is **OFF** (all tools allowed) |
| | `🔒` | Discuss mode is **BLOCK** (all tools blocked) |
| | `📖` | Discuss mode is **READ-ONLY** (inspection tools & read-only bash allowed) |
| **Commit Guard** | `📝` | Commit guard is **OFF** (`git commit` allowed) |
| | `🚫` | Commit guard is **ON** (`git commit` blocked) |
| **Crazy-Find Guard**| *(none)* | *(No icon to keep status bar uncluttered; defaults to ON)* |
| **Goal Loop** | `🎯` | Goal is active (turn-end nudge armed) |
| | *(cleared)*| No active goal |

---

## Documentation

* [`docs/features.md`](docs/features.md) — Comprehensive feature specifications, AST analysis, configuration precedence, and lifecycle invariants.
* [`docs/philosophy-and-north-star.md`](docs/philosophy-and-north-star.md) — Human-agent pairing principles and semantic collaboration signals.
* [`docs/parity-matrix.md`](docs/parity-matrix.md) — Legacy migration parity and verification records.
* [`docs/feature-impl/`](docs/feature-impl/) — Design docs, spikes, and implementation plans per feature.
