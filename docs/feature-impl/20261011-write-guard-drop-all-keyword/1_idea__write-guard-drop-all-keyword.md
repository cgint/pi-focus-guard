# write-guard-drop-all-keyword — idea

Date: 2026-10-11 · Status: **idea** · Owner: Firstmate (user owns requirements)

> Small, focused change to the existing Write Guard feature
> (`docs/features/write-guard.md`, `src/focus-guard.ts`). Not a new guard — it removes a
> hidden alias from an existing command.

## Problem

There are two ways to disable the write guard today, and only one is "real":

```
/focus-write-guard-all        ◄── the registered command (what the user types / autocompletes)
/focus-write-guard all        ◄── a hidden keyword branch INSIDE the /focus-write-guard handler
```

The keyword branch only fires when `all` is the **entire** argument. The moment anything
follows it, the branch is skipped and the input falls through to the "set list" path:

```
/focus-write-guard all              ──►  guard OFF                      (works, but nobody types this)
/focus-write-guard all <anything>   ──►  "all" + <words> become DIRS     (footgun)
```

Observed live: typing a sentence that began with `all` produced a garbage allowlist of
`[all, must, go, from, documentation, …]` — the alias silently did the *opposite* of its
intent (it widened the allowlist with nonsense dirs instead of disabling the guard).

## Idea

Make `all` stop being magic. Delete the keyword branch so the **only** way to disable the
guard is `/focus-write-guard-all`.

```
before:  /focus-write-guard  treats "all" as a hidden OFF-switch
after:   "all" is just an ordinary directory token;  /focus-write-guard-all  is the sole OFF-switch
```

Net effect: one unambiguous entry point to disable, and no footgun where a leading `all`
accidentally builds a bogus allowlist.

## Why this is safe and small

- The branch is **untested** — no test references the `all` keyword, so removing it breaks
  nothing.
- The command it shadows (`/focus-write-guard-all`) already exists and stays untouched, as
  do the `--write-guard-all` / `--write-guard-off` startup flags (a different mechanism).
- After removal, `/focus-write-guard all` simply falls through to the set-list path and
  creates a literal directory named `all` — self-evident, no hidden meaning.

## Open questions (carry into requirements)

- When the sole token is exactly `all`, emit a one-line *"did you mean
  `/focus-write-guard-all`?"* warning, or keep it minimal (no warning)? **User decision:
  keep it minimal — no warning.** (Settled in `2_requirements`.)
