# Feature Specifications & Command Reference

Authoritative technical reference, complete CLI/command inventories, AST detection mechanics, configuration hierarchies, and lifecycle invariants for `pi-focus-guard`.

[← Back to Main README](../../README.md)

---

## Focus Feature Groups

1. **[💬 Discuss Mode](discuss-mode.md)**
   * Off, Block, and Read-only investigation modes
   * Read-only AST bash inspection & non-mutating tool permissions
   * Inline directives (`-do:`, `-db:`, `-dr:`) and queuing lifecycle
   * Session persistence and tombstone semantics

2. **[🛡️ Write Guard](write-guard.md)**
   * Path normalization and canonicalization (`realpath`)
   * AST bash detection for redirections and mutating commands
   * Startup fail-fast validation for `--write-guard` and `.pi/settings.json`
   * Precedence hierarchy (flag > session > env > settings)

3. **[🎯 Goal Loop](goal-loop.md)**
   * Session-scoped objective tracking ($\le 500$ chars)
   * Turn-end steer cross-check nudge and anti-recursion latching
   * Active arm-and-go (`/focus-goal-start-submit`) and proposal (`/focus-goal-suggest`)
   * Status bar dart icon (`🎯`)

4. **[🧭 Crazy-Find Guard](crazy-find-guard.md)**
   * Default-ON protection against runaway `find /` and `find ~`
   * AST command unwrapping (`sudo`, `env`, `nohup`, `command`)
   * Project-relative search path exceptions

5. **[🚫 Commit Guard](commit-guard.md)**
   * Collaborative milestone finishing and git commit interceptor
   * Cooperative review messaging and git diff encouragement
   * Hoisted precedence over discuss-mode checking

---

## Authoritative Command Inventory

Every `/focus-*` command registered by the extension:

| Command | Category | Description |
| :--- | :--- | :--- |
| `/focus-discuss off\|block\|read` | Discuss | Switch discuss mode (`off`, `block`, or `read`) |
| `/focus-discuss` | Discuss | Display active discuss mode status |
| `/focus-discuss-off` | Discuss | Disable discuss mode (allow all tools) |
| `/focus-discuss-read` | Discuss | Enter read-only mode (allow inspection tools & read-only bash) |
| `/focus-discuss-block` | Discuss | Block all tool calls (conceptual alignment) |
| `/focus-write-guard <dirs>` | Write | Set write allowlist for current session (comma/space-separated) |
| `/focus-write-guard` | Write | Display current write guard policy and allowed directories |
| `/focus-write-guard all` / `-all` | Write | Disable write restrictions for this session |
| `/focus-goal-start <def>` | Goal | Arm turn-end goal cross-check without triggering a turn ($\le 500$ chars) |
| `/focus-goal-start-submit <def>` | Goal | Arm goal and immediately submit definition as user prompt to start work |
| `/focus-goal-suggest` | Goal | Ask the agent to propose a single adoptable session goal |
| `/focus-goal` | Goal | Print active goal definition, or state that none is active |
| `/focus-goal-end` | Goal | Disarm and clear active goal without judging completion |
| `/focus-crazy-find-guard` | Crazy-Find | Show crazy-find guard status |
| `/focus-crazy-find-guard-on` | Crazy-Find | Enable crazy-find guard (block `find /` and `find ~`) |
| `/focus-crazy-find-guard-off` | Crazy-Find | Disable crazy-find guard (allow unrestricted finds) |
| `/focus-commit-guard` | Commit | Show commit guard status |
| `/focus-commit-guard-on` | Commit | Block `git commit` commands until review is complete |
| `/focus-commit-guard-off` | Commit | Allow `git commit` commands again |

---

## Authoritative Startup Flags Matrix

All 12 startup flags supported by `pi-focus-guard`:

| Startup Flag | Category | Type | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `--dm-read` | Discuss | boolean | off | Start session in discuss read-only mode |
| `--dm-block` | Discuss | boolean | off | Start session in discuss block mode |
| `--dm-off` | Discuss | boolean | off | Start session with discuss mode disabled (overrides persisted state) |
| `--write-guard <dirs>` | Write | string | none | Start session with write allowlist set to comma-separated directories |
| `--write-guard-all` | Write | boolean | false | Start session with write guard disabled |
| `--write-guard-off` | Write | boolean | false | Start session with write guard disabled (same as `--write-guard-all`) |
| `--crazy-find-guard` / `-on` | Crazy-Find | boolean | **true** | Start session with crazy-find guard enabled (default) |
| `--crazy-find-guard-off` | Crazy-Find | boolean | **true** | Start session with crazy-find guard disabled |
| `--commit-guard` / `-on` | Commit | boolean | false | Start session with commit guard enabled |
| `--commit-guard-off` | Commit | boolean | false | Start session with commit guard disabled |

### Precedence Rules
1. **Explicit `off` precedence:** Flags ending in `-off` (e.g. `--dm-off`, `--commit-guard-off`, `--write-guard-off`, `--crazy-find-guard-off`) take precedence over enabling flags and persisted session state for that specific guard.
2. **Write guard validation:** Explicit allowlists are validated at startup before any flag evaluation. An empty or invalid allowlist causes Pi to report an error and shutdown rather than operating with ambiguous policies.
