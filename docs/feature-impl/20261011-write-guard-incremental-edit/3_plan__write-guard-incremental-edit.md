# write-guard-incremental-edit — plan

Date: 2026-10-11 · Status: **plan** · Owner: Firstmate (delegates implementation)

> Technical architecture, step-by-step tasks, and test coverage for the `+`/`-` incremental
> edit of `/focus-write-guard`. Requirements: `2_requirements__write-guard-incremental-edit.md`.

## Context (verified)

- The `write-guard-drop-all-keyword` feature is **already committed** (`e993d28`). The
  `/focus-write-guard` handler today has exactly two branches: **no args → display**, and
  **else → SET** (replace the whole list). There is **no** `all` keyword branch.
- So the new **EDIT** branch slots in between: `no args → display`, `any +/- → EDIT`,
  `else → SET`.

## Architecture

Two new pure-ish helpers in `src/write/config.ts`, reusing existing path utilities
(`resolveMaybeRelative`, `realpathIfExists`) — no new path logic.

### 1. `parseIncrementalOps(args: string): IncrementalOp[] | null`

```ts
export type IncrementalOp = { kind: "add" | "remove"; dir: string };
```

- Split `args` into tokens with the existing `parseDirsArgList` (whitespace/comma).
- If **no** token starts with `+`/`-` → return `null` (caller falls through to SET).
- If **any** token is prefixed → return the ordered `IncrementalOp[]`.
- In EDIT mode, an **unprefixed** token or a **bare** `+`/`-` (empty dir) throws
  `WriteGuardConfigError` (source `"command"`) with a clear detail — reusing the existing
  `reportWriteGuardConfigError` path.

### 2. `applyIncrementalOps(baseDirs, ops, cwd): Promise<{ dirs, removedMissing }>`

- Resolve each base dir and each op dir to a **canonical path**
  (`realpathIfExists(resolveMaybeRelative(d, cwd))`) for matching.
- Walk ops in order:
  - **add**: if the canonical path is not already present, append the raw dir.
  - **remove**: if a canonical match exists, remove that entry; else record the raw dir in
    `removedMissing`.
- Return the new raw `dirs` list and `removedMissing` (dirs that were removed but not found).

Matching is by resolved path, so `-docs`, `-./docs`, `-docs/` all match a stored `./docs`.

## Handler change (`src/focus-guard.ts`)

In the `focus-write-guard` handler, after the no-args display branch and before the SET
branch:

```
ops = parseIncrementalOps(argsTrimmed)   // may throw WriteGuardConfigError → reportWriteGuardConfigError
if ops !== null:
    base = activeWritePolicy?.enforce ? activeWritePolicy.dirs : []
    { dirs: newDirs, removedMissing } = await applyIncrementalOps(base, ops, ctx.cwd)

    if newDirs.length === 0 and base.length > 0:
        # DISALLOW last removal — list unchanged
        ctx.ui.notify(warning):
            "That would empty the allowlist. The list is unchanged.
             • disable the guard entirely  →  /focus-write-guard-all
             • set a new list              →  /focus-write-guard <dirs>"
        return

    if newDirs.length === 0:
        # base was empty → nothing to remove (no-op)
        ctx.ui.notify(info): "not in the allowlist / nothing to remove" (name removedMissing)
        return

    # apply
    writeSessionOverride = { mode: "allow", dirs: requireNonEmptyDirs(newDirs, "command") }
    activeWritePolicy    = { enforce: true, source: "session", dirs: writeSessionOverride.dirs }
    persistWriteOverride(); await updateWriteStatus(ctx)
    ctx.ui.notify(info) + pi.sendMessage: "Write guard updated … Allowed under: <list>"
        (+ "Not removed (not in allowlist): …" when removedMissing is non-empty)
    return
# else: existing SET branch (unchanged)
```

The TUI warning for the disallowed last-removal uses severity `"warning"`; success/no-op use
`"info"`. The `pi.sendMessage` persistence mirrors the existing SET branch.

## Steps (implementer)

1. `src/write/config.ts`: add `IncrementalOp`, `parseIncrementalOps`, `applyIncrementalOps`.
2. `src/focus-guard.ts`: import the two helpers; insert the EDIT branch in the handler.
3. `test/write-config.test.ts`: helper unit tests (see coverage).
4. `test/focus-guard.test.ts`: command-behavior tests (see coverage).
5. Docs: `docs/features/write-guard.md` (command table + short `+`/`-` section) and
   `README.md` (Write Guard quick-use line).
6. Run `npm run precommit` (typecheck + tests + audit) until green.

## Test coverage

**`parseIncrementalOps`**
- `"+/tmp +/data"` → `[{add,/tmp},{add,/data}]`
- `"-/tmp"` → `[{remove,/tmp}]`
- `"docs,openspec"` → `null` (SET mode)
- `"+/tmp docs"` → throws (mixed prefixed/unprefixed)
- `"+"` and `"-"` → throw (empty dir)
- `"+~/x"` → `[{add, "~/x"}]` (raw preserved)

**`applyIncrementalOps`** (temp dir as cwd)
- add to existing → appended
- add duplicate (same resolved path) → no-op
- remove existing → removed
- remove not found → in `removedMissing`
- remove the last → `dirs` empty
- mixed add+remove applied in order

**Command behavior (`focus-guard.test.ts`)**
- `+/tmp` with active `[src]` → `[src, /tmp]`
- `+src` with `[src]` → no-op (dedup)
- `-src` with `[src, test]` → `[test]`
- `-src` with `[src]` (last) → **disallowed**, list stays `[src]`, TUI `"warning"`
- `+/tmp` while guard OFF → guard ON with `[/tmp]`
- `src,test` (no prefix) → SET (replace)
- `+/tmp docs` (mixed) → rejected via config-error path
- `-x` not found → no-op `"info"` notice naming `x`

## Non-goals

- No new command; `+`/`-` live inside `/focus-write-guard`.
- No escape hatch for directories whose names begin with `-`.
- Do not touch `/focus-write-guard-all` or the `--write-guard-*` startup flags.
- Do not change the "empty allowlist = configuration error" rule for flag/env/settings.

## Acceptance bar (Firstmate)

- `npm run precommit` green (typecheck + tests + audit).
- All acceptance criteria in `2_requirements` satisfied (verified against the diff + tests).
- Independent reviewer cross-check + `cg-task.sh diff-review` show no real issues.
- Firstmate inspects the diff and reports acceptance to the user. **No commit without
  explicit user instruction.**