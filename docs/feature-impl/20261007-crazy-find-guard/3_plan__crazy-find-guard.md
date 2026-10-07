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
