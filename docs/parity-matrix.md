# pi-focus-guard parity matrix

This document defines the initial port target for `pi-focus-guard` and records implementation evidence.

Rule: existing `pi-write-guard` and `pi-discuss-mode` behavior is ported without semantic adaptation. New behavior is limited to the commit guard.

## Command surface

| Focus command | Legacy/source behavior | Status |
|---|---|---|
| `/focus-write-guard <dirs>` | `/write-guard <dirs>` | Implemented |
| `/focus-write-guard` | `/write-guard` status display | Implemented |
| `/focus-write-guard-all` | `/write-guard-all` / `/write-guard all` | Implemented |
| `/focus-discuss <mode>` | `/discuss-mode <mode>` | Implemented |
| `/focus-discuss` | `/discuss-mode` status display | Implemented |
| `/focus-discuss-off` | `/discuss-mode-off` | Implemented |
| `/focus-discuss-read` | `/discuss-mode-read` | Implemented |
| `/focus-discuss-block` | `/discuss-mode-block` | Implemented |
| `/focus-commit-guard` | New: show commit guard status | Implemented |
| `/focus-commit-guard-on` | New: block bash commands containing `git commit` | Implemented |
| `/focus-commit-guard-off` | New: allow `git commit` again | Implemented |

## Footer status

| Guard | Source key/icon behavior | Focus target | Status |
|---|---|---|---|
| Discuss guard | `a1_discuss`: `✅` off, `🔒` block, `📖` read | Preserve semantics | Implemented |
| Write guard | `a2_write_guard`: `✍️` off, `🔰` project-only, `🛡️` restricted | Preserve semantics | Implemented |
| Commit guard | New | `a3_commit_guard`: `📝` off, `🚫` on | Implemented |

## Enforcement parity

| Area | Expected behavior | Test evidence |
|---|---|---|
| Write tool | Block writes outside the effective allowlist exactly like `pi-write-guard`. | `write guard parity > blocks write tool targets outside the allowlist` |
| Write tool | Allow writes inside the effective allowlist exactly like `pi-write-guard`. | `write guard parity > allows write tool targets inside the allowlist` |
| Edit tool | Block edits outside the effective allowlist exactly like `pi-write-guard`. | `write guard parity > blocks edit tool targets outside the allowlist` |
| Bash writes | Detect and block write-capable bash targets outside the allowlist exactly like `pi-write-guard`. | `write guard parity > blocks bash write targets outside the allowlist` |
| Discuss block | Block all tool calls exactly like `pi-discuss-mode`. | `discuss mode parity > blocks all tool calls in block mode` |
| Discuss read | Allow read/investigation tools and read-only bash exactly like `pi-discuss-mode`; block write/action tools. | `discuss mode parity > allows read tool calls in read mode`; `allows read-only bash in read mode`; `blocks write-like bash in read mode` |
| Commit guard on | Block bash commands containing `git commit` with a collaborative-review message. | `commit guard > blocks bash commands containing git commit when enabled` |
| Commit guard off | Do not block bash commands solely because they contain `git commit`. | `commit guard > allows bash commands containing git commit when disabled` |
| Write persistence/status | Write guard session override is persisted and footer status updates. | `write guard parity > persists write guard allowlist and updates status` |
| Discuss persistence/status | Discuss mode session override is persisted and footer status updates. | `discuss mode parity > persists discuss mode and updates status` |
| Commit guard status | `/focus-commit-guard` prints status. | `commit guard > reports status through /focus-commit-guard` |
| Commit guard footer | Footer icon reflects enabled/disabled state. | `commit guard > enables via /focus-commit-guard-on and updates footer status` |

## Helper regression coverage

Original helper-level regression coverage has been ported into `pi-focus-guard` with imports adjusted to the new layout:

| Focus test | Source coverage |
|---|---|
| `test/write-bash-detect.test.ts` | `../pi-write-guard/test/bash-detect.test.ts` |
| `test/write-config.test.ts` | `../pi-write-guard/test/config.test.ts` |
| `test/discuss-config.test.ts` | `../pi-discuss-mode/test/config.test.ts` plus combined-extension exports |

Current verification: `npm run precommit` runs 96 Vitest tests across focus behavior and helper regression coverage.

## Exact-copy audit

The following helper modules were copied byte-for-byte from source at port start:

| Focus file | Source file | Audit result |
|---|---|---|
| `src/write/bash-detect.ts` | `../pi-write-guard/src/bash-detect.ts` | Exact match |
| `src/write/config.ts` | `../pi-write-guard/src/config.ts` | Exact match |
| `src/write/path-utils.ts` | `../pi-write-guard/src/path-utils.ts` | Exact match |
| `src/discuss/bash-detect.ts` | `../pi-discuss-mode/src/bash-detect.ts` | Exact match |
| `src/discuss/config.ts` | `../pi-discuss-mode/src/config.ts` | Exact match |
| `src/discuss/is-readonly.ts` | `../pi-discuss-mode/src/is-readonly.ts` | Exact match |

## Explicit non-decisions

- Legacy command names are intentionally not included unless explicitly requested.
- `pi-discuss-mode` README/code mismatch is not corrected in this port unless explicitly requested.
