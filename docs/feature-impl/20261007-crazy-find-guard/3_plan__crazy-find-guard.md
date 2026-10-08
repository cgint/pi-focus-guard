# Crazy-Find Guard — Technical Architecture & Implementation Plan

## Component Overview

1. **AST Analysis Module (`src/find/crazy-find-detect.ts`)**
   - Uses `unbash` to parse the command string into a `Script` AST.
   - Traverses all statement nodes, commands, pipelines, subshells, compound lists, and command substitutions (`CommandExpansion`).
   - Unwraps common command wrappers (`sudo`, `env`, `nohup`, `command`).
   - Identifies `find` invocations (command name `find` or ending with `/find`).
   - Inspects arguments:
     - Skips pre-path options (`-H`, `-L`, `-P`, `-E`, `-X`, etc.).
     - Extracts candidate starting search paths up to the first predicate or flag (`-name`, `-type`, `-exec`, `(`, etc.).
     - Checks each starting path against root (`/`) and user home (`os.homedir()`).
     - Normalizes paths, stripping trailing slashes and resolving `~`, `$HOME`, `${HOME}`.
     - Flags violations: `isCrazyRoot` or `isCrazyHome`.
   - Returns findings list: `{ commandName: string, rawPath: string, type: "root" | "home" }[]`.
   - Safety net fallback: If `unbash` AST parsing fails on invalid syntax, uses regex detection to avoid leaking unparseable sweeps.

2. **Integration into `focusGuard` (`src/focus-guard.ts`)**
   - In-memory state: `crazyFindGuardEnabled: boolean` (defaults to `true`).
   - Flags registered:
     - `--crazy-find-guard`
     - `--crazy-find-guard-on`
     - `--crazy-find-guard-off`
   - Commands registered:
     - `/focus-crazy-find-guard` (status check)
     - `/focus-crazy-find-guard-on` (enable)
     - `/focus-crazy-find-guard-off` (disable)
   - `session_start` lifecycle:
     - Checks `--crazy-find-guard-off` vs `--crazy-find-guard-on` / `--crazy-find-guard`.
     - Otherwise checks last persisted session entry `focus-crazy-find-guard`.
     - Defaults to `true` (enabled).
   - Hook in `tool_call`:
     - If `event.toolName === "bash"` and `crazyFindGuardEnabled`:
       - Run `extractCrazyFindTargets(command)`.
       - If findings exist, return `{ block: true, reason: formatCrazyFindBlockedReason(findings) }`.
       - Evaluated before write guard analysis for fast-fail on runaway find commands.

3. **Denial Formatter (`src/find/format-deny.ts` or helper in `src/focus-guard.ts`)**
   - Emits structured message naming the offending command/path and explicitly referencing `/focus-crazy-find-guard-off`.

## Test Plan (`test/crazy-find-guard.test.ts`)
1. **Unit tests for detector (`crazy-find-detect.test.ts`)**:
   - Blocks:
     - `find / -name foo`
     - `find /// -type f`
     - `find ~ -name bar`
     - `find ~/ -name bar`
     - `find $HOME -name bar`
     - `find ${HOME} -name bar`
     - `find /Users/<current-user> -name bar`
     - `find /Users/<current-user>/ -name bar`
     - `sudo find / -name secret`
     - `env find / -name secret`
     - `find -L / -name foo`
     - `find . / -name mixed`
     - `find ~/dev/concept -name "x.md"; find / -name "x.md"`
     - `x=$(find / -name test); echo $x`
     - `find / | grep something`
   - Allows:
     - `find . -name "*.ts"`
     - `find ./src -type f`
     - `find ~/dev/concept -name "x.md"`
     - `find $HOME/projects -name test`
     - `find /tmp -name scratch`
     - `find /var/log -name access.log`
     - `echo "find / is dangerous"`
2. **Integration tests (`test/focus-guard.test.ts`)**:
   - Default is ON on fresh start.
   - Command `/focus-crazy-find-guard-off` disables and allows `find /`.
   - Command `/focus-crazy-find-guard-on` re-enables and blocks `find /`.
   - Flag `--crazy-find-guard-off` starts disabled.
   - Flag `--crazy-find-guard-on` starts enabled.
   - State persists across sessions via `session_start` entry replay.

## Fix: Hook-Ordering Bypass in Discuss Read-Only Mode

See: `4_bug__hook-ordering-bypass-in-dm-read.md`

### Problem

The `tool_call` hook checks the discuss-mode policy **before** the crazy-find and commit guards. In `--dm-read` mode, `isBashCommandReadOnly(cmd)` returning `true` causes an early `return undefined`, which skips the crazy-find check entirely. Since `find /` has no write targets, the read-only classifier deems it safe, and the crazy-find guard is never consulted.

### Fix: Hoist Command-Specific Guards Above Discuss Policy

Reorder the `tool_call` hook so that **bash-specific safety guards** (crazy-find, commit) run **before** the discuss-policy check. Rationale: these are universal safety invariants that must apply regardless of discuss mode. Discuss mode governs *what operations are allowed*; it should not exempt a command from safety checks that protect against runaway processes.

```ts
// New order in tool_call hook:
pi.on("tool_call", async (event, ctx) => {
  // 1. Bash-specific safety guards (mode-agnostic)
  if (event.toolName === "bash") {
    const raw = (event.input as { command?: unknown }).command;
    if (typeof raw === "string" && raw.trim()) {
      // 1a. Crazy-find guard
      if (crazyFindGuardEnabled && raw.trim().includes("find")) {
        try {
          const findings = detectCrazyFind(raw.trim(), ctx.cwd, os.homedir());
          if (findings.length > 0)
            return { block: true, reason: formatCrazyFindBlockedReason(findings) };
        } catch (err) {
          return { block: true, reason: formatCrazyFindParseError(err instanceof Error ? err.message : String(err)) };
        }
      }
      // 1b. Commit guard
      if (commitGuardEnabled && commandContainsGitCommit(raw)) {
        return { block: true, reason: formatCommitGuardBlockedReason() };
      }
    }
  }

  // 2. Discuss policy (unchanged)
  const discussPolicy = getDiscussEffectivePolicy(activeDiscussMode);
  if (!isToolAllowedByDiscussPolicy(event.toolName, discussPolicy)) {
    // ... existing read-only / blocked logic ...
  }

  // 3. Write policy (unchanged)
  // ...
});
```

### Behavior Matrix (post-fix)

| Command | Mode | Guard | Result |
| :--- | :--- | :--- | :--- |
| `find /` | normal | crazy-find | **BLOCKED** (crazy-find message) |
| `find /` | `--dm-read` | crazy-find | **BLOCKED** (crazy-find message) ← *was: allowed* |
| `find .` | `--dm-read` | read-only ok | **ALLOWED** |
| `find /` | `--dm-read`, guard off | none | **ALLOWED** (guard disabled) |
| `git commit` | `--dm-read` | commit | **BLOCKED** (commit-guard message) ← *was: generic discuss rejection* |
| `git commit` | normal | commit | **BLOCKED** (commit-guard message) — unchanged |
| `find /` | normal, guard off | none | **ALLOWED** — unchanged |

### Required Test Cases (add to `test/focus-guard.test.ts`)

1. **Crazy-find blocked in dm-read**: Set discuss mode to `read`, enable crazy-find, call `tool_call` with `bash: "find / -name x"` → expect `{ block: true, reason: contains "CRAZY FIND GUARD" }`.
2. **Scoped find allowed in dm-read**: Same mode, `bash: "find ./src -name x"` → expect `undefined` (allowed).
3. **Crazy-find off in dm-read allows find /**: Disable crazy-find, same mode, `bash: "find /"` → expect `undefined` (allowed; read-only passes).
4. **Commit guard in dm-read**: Enable commit guard, set discuss mode to `read`, call `bash: "git commit -m test"` → expect commit-guard denial message (not generic discuss rejection). *Note: this may not be reachable if `isBashCommandReadOnly` already rejects `git commit` — verify and assert whichever path fires first.*
5. **Non-discuss regression**: Normal mode, `find /` blocked, `find .` allowed — existing tests should still pass.

### Files to Change

- `src/focus-guard.ts` — reorder `tool_call` hook (move crazy-find + commit checks above discuss check)
- `test/focus-guard.test.ts` — add integration tests for the matrix above
