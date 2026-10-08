# Crazy-Find Guard — Hook-Ordering Bug: Read-Only Discuss Mode Bypass

## Bug

In `--dm-read` (discuss read-only) mode, the `tool_call` hook in `src/focus-guard.ts` evaluates the discuss policy **before** the crazy-find and commit guards. For bash commands, when `isBashCommandReadOnly(cmd)` returns `true`, the hook executes `return undefined` (line ~650) and **never reaches** the crazy-find check (line ~665) or the commit guard check (line ~659).

This means:
- `find /` in read-only discuss mode is **not blocked** — it passes the read-only classifier (no write targets) and exits early.
- `git commit` in read-only discuss mode is blocked, but only by the generic discuss rejection (not the commit-guard message), because `isBashCommandReadOnly` rejects it for write reasons before the commit guard is consulted.

## Reproduction

```bash
# Start pi with: pi --dm-read
# In the session, the agent attempts:
bash: find / 2>/dev/null | head -5
# Expected: blocked by crazy-find guard
# Actual:   allowed (early-return before crazy-find check)
```

Verified live in session 2026-07-05: extension loaded, `crazyFindGuardEnabled === true` (default), detector flags `find /` as root when invoked directly, yet the bash call went through.

## Root Cause

The `tool_call` hook structure (before fix):

```ts
pi.on("tool_call", async (event, ctx) => {
  // 1. Discuss policy — early-returns for read-only bash
  const discussPolicy = getDiscussEffectivePolicy(activeDiscussMode);
  if (!isToolAllowedByDiscussPolicy(event.toolName, discussPolicy)) {
    if (discussPolicy.mode === "read" && event.toolName === "bash") {
      if (isBashCommandReadOnly(rawCommand)) return undefined;  // ← bypass
      return { block: true, reason: ... };
    }
    return { block: true, reason: ... };
  }

  // 2. Commit guard — SKIPPED when discuss read-only allows the command
  if (commitGuardEnabled && ...) { ... }

  // 3. Crazy-find guard — SKIPPED when discuss read-only allows the command
  if (crazyFindGuardEnabled && ...) { ... }

  // 4. Write policy
  ...
});
```

The discuss-mode early-return was added to permit safe read-only commands without running the write-guard path. As a side effect, it short-circuits **all** subsequent bash-specific guards.

## Impact

- **Crazy-find guard**: Dead in `--dm-read` mode for any command the read-only classifier deems safe. `find /`, `find ~`, `find $HOME` all execute unblocked.
- **Commit guard**: Dead in `--dm-read` mode for any commit invocation the classifier deems read-only (currently none, since git writes are not read-only — but the ordering is still wrong).
- **Non-discuss modes**: Unaffected. In normal/focus modes, `isToolAllowedByDiscussPolicy` returns `true` for bash, so the early-return branch is never entered and all guards run in sequence.

## Related

- Feature: `docs/feature-impl/20261007-crazy-find-guard/` (original implementation)
- Feature: `docs/feature-impl/20261007-discuss-mode-resume-restore/` (discuss mode design)
