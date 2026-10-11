# write-guard-incremental-edit — idea

Date: 2026-10-11 · Status: **idea** · Owner: Firstmate (user owns requirements)

> Small, focused enhancement to the existing Write Guard feature
> (`docs/features/write-guard.md`, `src/focus-guard.ts`). Not a new guard — it adds
> in-place editing (`+`/`-`) to the existing `/focus-write-guard` command. This is the
> "separate fork" that `20261011-write-guard-drop-all-keyword` explicitly set aside.

## Problem

`/focus-write-guard <dirs>` **replaces** the whole allowlist. There is no way to add or
remove a single directory without restating every directory you still want:

```
today:   /focus-write-guard src,test,docs     (set — full list every time)
want:    /focus-write-guard +/tmp             (add one, keep the rest)
         /focus-write-guard -test             (remove one, keep the rest)
```

As the allowlist grows, restating the full list each time is tedious and error-prone
(drop a dir by accident and it silently disappears from the allowlist).

## Idea

Add two token prefixes to `/focus-write-guard`:

```
+<dir>   ──►  ADD <dir> to the current allowlist
-<dir>   ──►  REMOVE <dir> from the current allowlist
```

Mode is chosen by the presence of any `+`/`-` prefix:

```
no +/- token   ──►  SET mode      (today's behavior, unchanged — full replace)
any +/- token  ──►  EDIT mode     (apply adds/removes to the current list)
```

This keeps the existing command and its plain-list behavior fully backward compatible;
`+`/`-` is purely additive.

## How editing works

- **Base list** = the directories of the *currently effective* policy (whatever source is
  active: session override, flag, env, or settings). Editing layers on top of it and writes
  the result back as a session override.
  ```
  settings = [docs]   (no session override yet)
     └─ +/tmp  ──►  session override = [docs, /tmp]
  ```
- **Matching** for add-dedup and remove is by **canonical resolved path** (via the existing
  `resolveMaybeRelative` + `realpathIfExists`), not raw string equality — so `-docs`,
  `-./docs`, and `-docs/` all match a stored `./docs`.
- **`+` always applies.** Adding while the guard is OFF turns the guard ON with the added
  dir(s) (base = `[]`). This is the safe direction — it only ever adds restriction.
- **`-` applies unless it would empty the list.** See below.

## The remove-last-entry case (the crux)

The type system only allows two states: `enforcing with ≥1 dir` or `off`. An empty
allowlist is not representable (`requireNonEmptyDirs` throws). So removing the last entry
has exactly two exits:

```
[src]  ── -src ──►  []  ──┬──►  OFF          (Option A)
                          └──►  refuse       (Option B)
```

**Option A (→ OFF)** is a safety inversion: a guard whose job is to *restrict* writes would
flip from "restricted" to "writes allowed anywhere" the moment the last rule is removed.
If the user's intent was "lock it down / stop writing," Option A hands them the opposite.

**Option B (refuse)** keeps the "empty = invalid" invariant and forces the explicit choice
the codebase already insists on (see the existing `WriteGuardConfigError` message: *"…or use
read-only discuss mode if you intend to forbid all writes"*):

```
"That would empty the allowlist.
   • disable the guard entirely  →  /focus-write-guard-all
   • block ALL writes            →  discuss read-mode"
```

**Leading proposal: Option B (refuse).** It is the only option that cannot silently invert
restriction into full access, and it matches how the code already treats "block all" as a
separate, explicit act.

## Why this is small and safe

- Purely additive to the existing command; plain-list (SET) behavior is untouched.
- The heavy lifting (path resolution, canonicalization, containment checks) already exists in
  `src/write/path-utils.ts` and is reused, not reinvented.
- Editing writes through the existing session-override + persistence path
  (`persistWriteOverride()` / `updateWriteStatus()`), so it survives session restart like
  today's SET behavior does.

## Decisions (settled in `2_requirements`)

- **Remove-last behavior:** **Settled — Option B (disallow + TUI message).** Removing the
  last dir is refused, the list is unchanged, and a TUI warning points to
  `/focus-write-guard-all` (disable) or `/focus-write-guard <dirs>` (set a new list).
  Option A (turn the guard OFF) was the rejected alternative.
- **Add-while-OFF:** accepted — turning the guard ON with the added dir(s).
- **A directory literally named `-foo`:** accepted as a known limitation (the `-` is consumed
  as the remove prefix); no escape hatch.