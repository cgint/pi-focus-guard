# Feature Specifications Index

Detailed behavioral specifications, AST detection mechanics, configuration hierarchies, and lifecycle invariants for each focus guard rail in `pi-focus-guard`.

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
