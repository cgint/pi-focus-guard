# write-guard-drop-all-keyword — plan

Date: 2026-10-11 · Status: **plan (settled; small-scope, no spikes)** · Owner: Firstmate

> Technical plan. User-facing behavior is settled in
> `2_requirements__write-guard-drop-all-keyword.md` (no-warning decision, keyword-only
> scope).

## Design

One code deletion + five doc-line edits + one new test. No new state, no new command, no
new hook, no dependency change.

### Code: delete the `all` branch

In `src/focus-guard.ts`, inside the `pi.registerCommand("focus-write-guard", …)` handler,
remove this block (it sits between the "no args → display" early-return and the
`parseDirsArgList` set-list path):

```ts
      const lower = argsTrimmed.toLowerCase();
      if (lower === "all") {
        writeSessionOverride = { mode: "off" };
        activeWritePolicy = { enforce: false, source: "session(off)", dirs: null };
        persistWriteOverride();
        await updateWriteStatus(ctx);
        if (ctx.hasUI) {
          ctx.ui.notify("Write guard disabled — no write restrictions for this session.", "info");
          await pi.sendMessage(
            { customType: WRITE_PERSIST_TYPE, content: "Write guard disabled — no write restrictions for this session.", display: true },
            { triggerTurn: false },
          );
        }
        return;
      }
```

After deletion, the handler reads: `no args → display`, then straight to
`parseDirsArgList(argsTrimmed)` → set-list. `all` becomes an ordinary token.

**Why this is the only code change:** the disable state (`session(off)`) is set by the
*separate* `/focus-write-guard-all` command and by the startup flags — both untouched. Only
the keyword entry point disappears.

### Docs: 5 lines

| File | Line | Change |
| :--- | :--- | :--- |
| `README.md` | 61 | `` `/focus-write-guard src/auth,test/auth`, `/focus-write-guard all` `` → `` `/focus-write-guard src/auth,test/auth` ``; add `/focus-write-guard-all` to the disable note |
| `README.md` | 109 | `/focus-write-guard <dirs>` *(or `all`)* → `/focus-write-guard <dirs>` *(disable: `/focus-write-guard-all`)* |
| `docs/features/write-guard.md` | 15 | `/focus-write-guard all` / `-all` → `/focus-write-guard-all` |
| `docs/features/write-guard.md` | 25 | precedence item 2: drop "or `/focus-write-guard all` (`source: session(off)`)" — keep the `/focus-write-guard <dirs>` (session) part; note disable via `/focus-write-guard-all` |
| `docs/features/README.md` | 54 | `/focus-write-guard all` / `-all` → `/focus-write-guard-all` |

Keep every other doc line byte-for-byte identical.

## Test coverage (vitest, `test/focus-guard.test.ts`)

Follow the existing mock seams (`createPiMock`, `createCtx`, `invoke`).

1. **`all` is now a literal dir token:**
   `invoke(pi, "focus-write-guard", "all", createCtx({ cwd: "/project" }))` → the active
   policy enforces with dirs `["all"]` (resolved to `/project/all`); a `write` to
   `/project/all/x.txt` is allowed, a write to `/outside/x.txt` is blocked. This pins the
   new behavior (previously this input disabled the guard).
2. **`/focus-write-guard-all` still disables:** existing behavior — assert
   `activeWritePolicy` becomes `enforce: false, source: "session(off)"`.
3. **No regression on the set-list path:** `/focus-write-guard docs` still sets `[docs]`.

(If a test asserting the *old* `all`→disable behavior exists, it must be updated — a grep
confirmed none does, so this is purely additive.)

## Gate

`npm run precommit` (`tsc --noEmit && npm test && npm audit --audit-level=moderate`) green.
No dependency or lockfile change, so the audit is expected to stay clean.

## Risks / unknowns

- **Live muscle-memory:** any user who habitually typed `/focus-write-guard all` will now
  create a dir named `all` instead of disabling. Mitigated by the doc update and by the
  unambiguous `/focus-write-guard-all`. No code mitigation (per the no-warning decision).
- Nothing else: no hooks, no state, no parsing added.
