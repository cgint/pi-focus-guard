# write-guard-incremental-edit — requirements

Date: 2026-10-11 · Status: **requirements (settled)** · Owner: Firstmate (user owns requirements)

> Non-technical, user-facing requirements only. Home repo: **pi-focus-guard**.

## Problem

See `1_idea__write-guard-incremental-edit.md`. In one line: `/focus-write-guard` can only
*replace* the whole allowlist; there is no way to add or remove a single directory without
restating every directory still wanted.

## Syntax

`/focus-write-guard` gains two token prefixes. Tokens are still separated by whitespace and/or
commas, exactly as today.

```
/focus-write-guard +<dir> [<dir> …]     ADD one or more directories
/focus-write-guard -<dir> [<dir> …]     REMOVE one or more directories
/focus-write-guard +<a> -<b> …          mixed, applied left-to-right
```

Mode selection:

```
no token has a +/- prefix   ──►  SET mode   (today's behavior: replace the whole list)
at least one +/- prefix     ──►  EDIT mode  (apply adds/removes to the current list)
```

In EDIT mode, a token **without** a prefix is an error (ambiguous — is it a set or an add?).

## What the change must do (user-facing)

1. **`+<dir>` adds** `<dir>` to the current allowlist. Duplicates (by resolved path) are
   ignored — adding a dir that is already allowed is a no-op.
2. **`-<dir>` removes** `<dir>` from the current allowlist. Matching is by resolved path, so
   `-docs`, `-./docs`, and `-docs/` all remove a stored `./docs`.
3. **Editing is based on the currently effective list** (whatever source is active — session
   override, startup flag, env, or project settings). The result is stored as a session
   override and persists across session restart, exactly like today's SET behavior.
4. **`+` while the guard is OFF** turns the guard ON with the added dir(s).
5. **`-` that would empty the list is disallowed.** The operation is refused, the list is
   left unchanged, and a message is shown to the user in the TUI pointing to the two exits
   (see "Remove-last behavior" below).
6. **SET mode is unchanged.** `/focus-write-guard` (no args) still displays the policy;
   `/focus-write-guard <dirs>` still replaces the list; `/focus-write-guard-all` still
   disables the guard.

## Remove-last behavior (the crux — settled)

Removing the last remaining directory is **disallowed** — the operation is refused and the
list is left unchanged. A message is shown to the user in the TUI (warning) offering the two
exits:

```
allowlist = [src]
   └─ /focus-write-guard -src
        ──►  (disallowed — list stays [src])
             "That would empty the allowlist. The list is unchanged.
              • disable the guard entirely  →  /focus-write-guard-all
              • set a new list              →  /focus-write-guard <dirs>"
```

Rationale: an empty allowlist is not a valid state in this codebase (it is a configuration
error). Disallowing the removal prevents a guard meant to *restrict* writes from silently
flipping to *allow everything* the moment the last rule is removed, and steers the user to an
explicit choice instead.

> **Settled (2026-10-11, user decision):** disallow the last removal and show a TUI message
> pointing to `/focus-write-guard-all` (disable) or `/focus-write-guard <dirs>` (set a new
> non-empty list). This is Option B from the idea doc; Option A (turn the guard OFF) was the
> rejected alternative.

## What the change must NOT do

- Must not change SET-mode behavior (plain list replacement, no-args display).
- Must not touch the `/focus-write-guard-all` command or the `--write-guard-*` startup flags.
- Must not change the "empty allowlist = configuration error" rule for the other sources
  (flag / env / settings).
- Must not introduce a new command; `+`/`-` live inside the existing `/focus-write-guard`.
- Must not build an escape hatch for directories whose names begin with `-` (known
  limitation, documented as such).

## Relationship to `write-guard-drop-all-keyword`

Both features edit the argument parsing of the same `/focus-write-guard` handler. The
drop-all-keyword feature is **already committed** (`e993d28`): the hidden `all` keyword
branch is gone, so the handler today is just `no args → display` and `else → SET`. This
feature inserts the `+`/`-` EDIT branch between them:

```
no args  ──►  display
any +/-  ──►  EDIT           (this feature)
else     ──►  SET
```

No interaction risk: the EDIT branch is purely additive and the `all` keyword no longer
exists to collide with.

## Acceptance criteria (behavioral)

- `/focus-write-guard +/tmp` with an active list `[src]` yields `[src, /tmp]`.
- `/focus-write-guard +src` with `[src]` is a no-op (dedup by resolved path).
- `/focus-write-guard -src` with `[src, test]` yields `[test]`.
- `/focus-write-guard -docs` / `-./docs` / `-docs/` each remove a stored `./docs`.
- `/focus-write-guard -src` with `[src]` (the last entry) is **disallowed**; the list stays
  `[src]` and a TUI warning names `/focus-write-guard-all` and `/focus-write-guard <dirs>`.
- `/focus-write-guard +/tmp` while the guard is OFF turns the guard ON with `[/tmp]`.
- `/focus-write-guard src,test` (no prefix) still **replaces** the list with `[src, test]`.
- `/focus-write-guard` (no args) still displays the active policy.
- `/focus-write-guard +/tmp docs` (mixed prefix/unprefix in EDIT mode) is rejected as
  ambiguous.
- A `-<dir>` that matches nothing is a no-op with a "not in the allowlist" notice.
- `npm run precommit` is green (typecheck + tests + audit).