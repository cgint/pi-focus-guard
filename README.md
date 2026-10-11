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
* 📖 *Full details:* [Discuss Mode in docs/features.md](docs/features.md#discuss-mode)

---

### 2. 🛡️ Write Guard — *Keep writes inside approved directories*
* **The Problem:** The agent strays outside the task scope, editing config files, dependencies, or unrelated folders.
* **The Solution:** Restricts all filesystem modifications (`write`, `edit`, and shell redirections/mutations in `bash`) to an approved allowlist. Denials explain the boundary so the agent asks rather than hacking around it.
* **Quick Use:**
  * Commands: `/focus-write-guard src/auth,test/auth`, `/focus-write-guard all`
  * Flags: `--write-guard src/auth,test/auth`, `--write-guard-all`
  * Config: Define `allowedDirs` in `.pi/settings.json`
* 📖 *Full details:* [Write Guard in docs/features.md](docs/features.md#write-guard)

---

### 3. 🚫 Commit Guard — *Never commit without human review*
* **The Problem:** The agent runs `git commit` prematurely before you have reviewed the diff together.
* **The Solution:** Intercepts `git commit` commands in bash with a cooperative reminder that finishing and review are done collaboratively.
* **Quick Use:**
  * Commands: `/focus-commit-guard-on`, `/focus-commit-guard-off`, `/focus-commit-guard`
  * Flags: `--commit-guard-on`, `--commit-guard-off`
* 📖 *Full details:* [Commit Guard in docs/features.md](docs/features.md#commit-guard)

---

### 4. 🧭 Crazy-Find Guard — *Block runaway root and home searches*
* **The Problem:** The agent runs `find /` or `find ~` looking for a file, hanging the session, scanning external volumes, or hitting permission walls.
* **The Solution:** Enabled by default. AST inspection blocks unrestricted sweeps at `/` and `~` while keeping project-scoped searches (e.g. `find .`, `find ./src`, `find ~/dev/repo`) completely unaffected.
* **Quick Use:**
  * Commands: `/focus-crazy-find-guard-on`, `/focus-crazy-find-guard-off`
  * Flags: `--crazy-find-guard-off` *(opt-out)*
* 📖 *Full details:* [Crazy-Find Guard in docs/features.md](docs/features.md#crazy-find-guard)

---

### 5. 🎯 Goal Loop — *Keep multi-step work anchored to the end state*
* **The Problem:** The agent stops after completing one small subtask and hands control back when the broader objective is still incomplete.
* **The Solution:** A session-scoped goal ($\le 500$ chars) that nudges the agent at the end of every turn: *Is this goal genuinely reached? If not, keep working; if so, release to the user.*
* **Quick Use:**
  * Arm & Go: `/focus-goal-start-submit "all unit tests in test/auth pass"`
  * Arm passively: `/focus-goal-start <def>`
  * Ask for a proposal: `/focus-goal-suggest`
  * End goal: `/focus-goal-end`
* 📖 *Full details:* [Goal Loop in docs/features.md](docs/features.md#goal-loop)

---

## Quick Reference

### Commands Cheat-Sheet

| Command | Description |
| :--- | :--- |
| `/focus-discuss off\|block\|read` | Switch discuss mode (`off`, `block`, or `read`) |
| `/focus-discuss-off` / `-read` / `-block` | Quick shortcuts to switch discuss modes |
| `/focus-discuss` | Display active discuss mode status |
| `/focus-write-guard <dirs>` | Set write allowlist for the current session (comma/space-separated) |
| `/focus-write-guard` | Display current write guard policy and allowed directories |
| `/focus-write-guard-all` | Disable write restrictions for this session |
| `/focus-commit-guard-on` / `-off` | Toggle commit blocking on/off |
| `/focus-commit-guard` | Show commit guard status |
| `/focus-crazy-find-guard-on` / `-off` | Toggle crazy-find blocking on/off |
| `/focus-crazy-find-guard` | Show crazy-find guard status |
| `/focus-goal-start <def>` | Arm turn-end goal cross-check without triggering a turn ($\le 500$ chars) |
| `/focus-goal-start-submit <def>` | Arm goal and immediately submit definition as user prompt to start work |
| `/focus-goal-suggest` | Ask the agent to propose a single adoptable session goal |
| `/focus-goal` | Print active goal definition, or state that none is active |
| `/focus-goal-end` | Disarm and clear active goal without judging completion |

### Startup Flags

| Flag | Description |
| :--- | :--- |
| `--dm-read` / `--dm-block` / `--dm-off` | Start session in discuss read-only, block, or off mode |
| `--write-guard <dirs>` | Start session with write allowlist set to comma-separated directories |
| `--write-guard-all` / `--write-guard-off` | Start session with write guard disabled |
| `--commit-guard-on` / `--commit-guard-off` | Start session with commit guard enabled or disabled |
| `--crazy-find-guard-off` | Start session with crazy-find guard disabled (defaults to ON) |

*Precedence:* Explicit `off` flags override on/read/block flags and persisted state for their respective guard.

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

* [`docs/features.md`](docs/features.md) — Exhaustive technical reference (AST detection, config hierarchy, fail-fast rules, lifecycle invariants).
* [`docs/philosophy-and-north-star.md`](docs/philosophy-and-north-star.md) — The pairing philosophy: boundaries as collaboration signals, not cold blocks.
* [`docs/parity-matrix.md`](docs/parity-matrix.md) — Parity matrix with predecessor extensions (`pi-write-guard`, `pi-discuss-mode`).
