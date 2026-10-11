# pi-focus-guard

**Focus controls and semantic guard rails for Pi under one clear `/focus-*` command family.**

When pairing with an AI agent, you don't need a cold, silent sandbox — you need **shared situational awareness**.

`pi-focus-guard` gives you conversational, phase-aware guard rails that communicate *why* boundaries exist so the agent cooperates rather than routing around them.

---

## The Collaboration Lifecycle

`pi-focus-guard` aligns your agent to your current working phase:

```text
 1. DISCUSS & INVESTIGATE         2. ACT & BUILD                   3. REVIEW & FINISH
 ─────────────────────────        ──────────────────────           ───────────────────
 "Let's align before acting"      "Stay focused on the goal"       "We finish together"

 • Discuss Mode (block / read)    • Write Guard (scoped paths)     • Commit Guard
 • Inline directives (-dr:, -db:) • Crazy-Find Guard (no runaway)  • Collaborative git diff
                                  • Goal Loop (turn-end nudge)
```

---

## Installation

Add to your Pi extensions or install via Pi CLI:

```bash
# Install via Pi CLI
pi install git:github.com/cgint/pi-focus-guard

# Or run directly on demand
pi -e /path/to/pi-focus-guard
```

---

## The 5 Focus Controls

### 1. 💬 Discuss Mode — *Stop premature coding; investigate first*
* **The Problem:** The agent starts rewriting files before you've agreed on architecture, or you just want to investigate without altering code.
* **The Solution:** Three clear modes:
  * `off`: Normal execution.
  * `block`: Strictly steps back from all tools to discuss concepts and trade-offs.
  * `read`: Lets the agent inspect freely (read-only bash, web search, subagents, inspection tools) while strictly blocking `write` and `edit`.
* **Quick Use:**
  * Commands: `/focus-discuss read`, `/focus-discuss block`, `/focus-discuss off`
  * Inline in prompt: `-dr: investigate the failing test` *(read-only)* or `-db: plan the refactor` *(block)*
  * Flags: `--dm-read`, `--dm-block`, `--dm-off`
* 📖 *Full details:* [Discuss Mode in docs/features/discuss-mode.md](docs/features/discuss-mode.md)

---

### 2. 🛡️ Write Guard — *Keep writes inside approved directories*
* **The Problem:** The agent strays outside the task scope, editing config files, dependencies, or unrelated folders.
* **The Solution:** Restricts all filesystem modifications (`write`, `edit`, and shell redirections/mutations in `bash`) to an approved allowlist. Denials explain the boundary so the agent asks rather than hacking around it.
* **Quick Use:**
  * Commands: `/focus-write-guard src/auth,test/auth` · disable: `/focus-write-guard-all`
  * Flags: `--write-guard src/auth,test/auth`, `--write-guard-all`
  * Config: Define `allowedDirs` in `.pi/settings.json`
* 📖 *Full details:* [Write Guard in docs/features/write-guard.md](docs/features/write-guard.md)

---

### 3. 🎯 Goal Loop — *Keep multi-step work anchored to the end state*
* **The Problem:** The agent stops after completing one small subtask and hands control back when the broader objective is still incomplete.
* **The Solution:** A session-scoped goal ($\le 500$ chars) that nudges the agent at the end of every turn: *Is this goal genuinely reached? If not, keep working; if so, release to the user.*
* **Quick Use:**
  * Arm & Go: `/focus-goal-start-submit "all unit tests in test/auth pass"`
  * Arm passively: `/focus-goal-start <def>`
  * Ask for a proposal: `/focus-goal-suggest`
  * End goal: `/focus-goal-end`
* 📖 *Full details:* [Goal Loop in docs/features/goal-loop.md](docs/features/goal-loop.md)

---

### 4. 🧭 Crazy-Find Guard — *Block runaway root and home searches*
* **The Problem:** The agent runs `find /` or `find ~` looking for a file, hanging the session, scanning external volumes, or hitting permission walls.
* **The Solution:** Enabled by default. AST inspection blocks unrestricted sweeps at `/` and `~` while keeping project-scoped searches (e.g. `find .`, `find ./src`, `find ~/dev/repo`) completely unaffected.
* **Quick Use:**
  * Commands: `/focus-crazy-find-guard-on`, `/focus-crazy-find-guard-off`
  * Flags: `--crazy-find-guard-off` *(opt-out)*
* 📖 *Full details:* [Crazy-Find Guard in docs/features/crazy-find-guard.md](docs/features/crazy-find-guard.md)

---

### 5. 🚫 Commit Guard — *Never commit without human review*
* **The Problem:** The agent runs `git commit` prematurely before you have reviewed the diff together.
* **The Solution:** Intercepts `git commit` commands in bash with a cooperative reminder that finishing and review are done collaboratively.
* **Quick Use:**
  * Commands: `/focus-commit-guard-on`, `/focus-commit-guard-off`, `/focus-commit-guard`
  * Flags: `--commit-guard-on`, `--commit-guard-off`
* 📖 *Full details:* [Commit Guard in docs/features/commit-guard.md](docs/features/commit-guard.md)

---

## Quick Reference

### Daily Driver Cheat-Sheet

The core interactive controls for each phase of pairing:

| Guard Rail | Primary Command | Startup Flag | Footer Icon | Details |
| :--- | :--- | :--- | :---: | :---: |
| **💬 Discuss Mode** | `/focus-discuss read\|block\|off` *(or `-dr:`, `-db:`, `-do:`)* | `--dm-read`, `--dm-block` | `📖` `🔒` `✅` | [Spec](docs/features/discuss-mode.md) |
| **🛡️ Write Guard** | `/focus-write-guard <dirs>` *(disable: `/focus-write-guard-all`)* | `--write-guard <dirs>` | `🛡️` `🔰` `✍️` | [Spec](docs/features/write-guard.md) |
| **🎯 Goal Loop** | `/focus-goal-start-submit <def>` | *(session-scoped)* | `🎯` | [Spec](docs/features/goal-loop.md) |
| **🧭 Crazy-Find Guard**| `/focus-crazy-find-guard-off` | `--crazy-find-guard-off` | *(none)* | [Spec](docs/features/crazy-find-guard.md) |
| **🚫 Commit Guard** | `/focus-commit-guard-on` / `-off` | `--commit-guard-on` | `🚫` `📝` | [Spec](docs/features/commit-guard.md) |

> 📖 *For the complete 17-command inventory, all aliases, and the full 12-flag startup matrix with precedence rules, see the [Authoritative Command Reference](docs/features/README.md#authoritative-command-inventory).*

### Inline Discuss Directives

Switch mode directly inside any user message:
* `-dr: <message>` — Read-only mode: investigate without editing.
* `-db: <message>` — Block mode: discuss concepts without tools.
* `-do: <message>` — Off mode: resume normal tool execution.

*Example:* `-dr: investigate why authentication fails on refresh`

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
| **Goal Loop** | `🎯` | Goal is active (turn-end cross-check armed) |
| | *(cleared)*| No active goal |

---

## Further Reading

* [`docs/features/`](docs/features/README.md) — Comprehensive technical specifications per focus feature group (AST detection, config hierarchy, fail-fast rules, lifecycle invariants).
* [`docs/philosophy-and-north-star.md`](docs/philosophy-and-north-star.md) — The pairing philosophy: boundaries as collaboration signals, not cold blocks.
* [`docs/parity-matrix.md`](docs/parity-matrix.md) — Parity matrix with predecessor extensions (`pi-write-guard`, `pi-discuss-mode`).
