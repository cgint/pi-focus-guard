# write-guard-drop-all-keyword — requirements

Date: 2026-10-11 · Status: **requirements (settled)** · Owner: Firstmate (user owns requirements)

> Non-technical, user-facing requirements only. Home repo: **pi-focus-guard**.

## Problem

See `1_idea__write-guard-drop-all-keyword.md`. In one line: the `/focus-write-guard all`
keyword is a hidden, footgun-prone alias for `/focus-write-guard-all` and should be removed
so disabling the guard has exactly one obvious entry point.

## What the change must do (user-facing)

1. **`/focus-write-guard all` no longer disables the guard.** The word `all` loses its
   special meaning inside `/focus-write-guard`.
2. **`/focus-write-guard-all` is the one and only way to disable the guard** via a slash
   command. It keeps working exactly as it does today.
3. **Everything else about `/focus-write-guard` is unchanged:**
   - `/focus-write-guard` (no args) → display the active policy.
   - `/focus-write-guard <dirs>` → set the allowlist.
   - The footer icons, startup flags, and config-file behavior are all unchanged.

## What happens to the word `all` after the change

`all` becomes an ordinary directory token. So:

```
/focus-write-guard all        ──►  sets the allowlist to a single dir named "all"
                                   (i.e. <cwd>/all)  — not a disable, just a literal dir
```

This is the accepted, intended consequence: no hidden meaning, and the correct disable is
unambiguous.

## What the change must NOT do

- Must not touch the `/focus-write-guard-all` command's behavior or registration.
- Must not touch the `--write-guard-all` / `--write-guard-off` startup flags (separate
  mechanism, different precedence layer).
- Must not add a new command, flag, or any `+`/`-` incremental-edit syntax (that is a
  separate, out-of-scope idea).
- Must not change the "empty allowlist = configuration error" rule.

## Settled (2026-10-11, user decision)

1. **No warning.** When the sole token is exactly `all`, do *not* emit a "did you mean
   `/focus-write-guard-all`?" hint. Keep the change minimal — `all` is just a dir token.
2. **Scope is the keyword only.** The `+`/`-` incremental add/remove feature is explicitly
   out of scope for this change (it was discussed, then set aside as a separate fork).

## Acceptance criteria (behavioral)

- `/focus-write-guard-all` (no args) disables the guard for the session, exactly as before.
- `/focus-write-guard all` sets the allowlist to a single directory named `all`
  (`<cwd>/all`); it does **not** disable the guard.
- `/focus-write-guard` (no args) still displays the active policy.
- `/focus-write-guard <dirs>` still sets the allowlist.
- No documentation line advertises `/focus-write-guard all` as a disable shortcut; the
  disable is documented only as `/focus-write-guard-all`.
- `npm run precommit` is green (typecheck + tests + audit).
