# Gap Analysis — Discuss Mode Resume-Restore

## 1. Observed Behavior vs. Expected Behavior

| Aspect | Expected | Observed | Gap |
|--------|----------|----------|-----|
| Resume after `--dm-read` → in-session off | Mode is **off** (user explicitly disabled it) | Mode is **read** (flag-set state resurrected) | **Gap**: explicit off not persisted |
| Resume after `--dm-read` (no in-session change) | Mode is **read** | Mode is **read** | No gap — correct |
| Resume after `--dm-block` → in-session off | Mode is **off** | Mode is **block** (presumed same mechanism) | **Gap**: same as above |
| Resume after in-session `/focus-discuss read` → off | Mode is **off** | Mode is **read** (presumed) | **Gap**: same as above |
| Fresh session, no flags, no prior entries | Mode is **off** (default) | Mode is **off** | No gap — correct |

## 2. Root Cause (Verified in Source)

### 2.1 The persistence guard

`src/focus-guard.ts` L175–177:
```ts
function persistDiscussOverride(): void {
  if (activeDiscussMode.mode === "off") return;   // ← guard drops off
  pi.appendEntry(DISCUSS_PERSIST_TYPE, activeDiscussMode);
}
```

`setDiscussMode(mode)` (L207–209) unconditionally sets `activeDiscussMode = { mode, explicit: true }` then calls `persistDiscussOverride()`. So:

- `setDiscussMode("read")` → persisted ✅
- `setDiscussMode("block")` → persisted ✅
- `setDiscussMode("off")` → **not persisted** ❌

### 2.2 The restore path

`src/focus-guard.ts` L513–518 (inside `session_start` handler, else-branch when no `--dm-*` flag matches):
```ts
const lastDiscuss = entries
  .filter((e) => e.type === "custom" && e.customType === DISCUSS_PERSIST_TYPE)
  .pop() as { data?: ActiveMode } | undefined;
if (lastDiscuss?.data) {
  activeDiscussMode = lastDiscuss.data;
}
```

`.pop()` takes the **last** `discuss-mode` custom entry. Since `off` was never appended, the last entry is whatever was last set to `read` or `block`.

### 2.3 Why the design assumed this was fine

README states: *"off remains a session-only override and is not persisted."*

This was inherited from legacy `pi-discuss-mode`. The implicit assumption: **off is the default state**, so persisting it is redundant. The assumption holds when:
- No startup flag sets a non-default mode, AND
- The user only ever toggles off→on→off within a session (the last persisted entry is always the last non-off mode, and the user expects to re-enter that mode on resume).

The assumption **breaks** when:
- A startup flag (`--dm-read`, `--dm-block`) sets a non-default mode (which IS persisted), AND
- The user then explicitly turns it off in-session (which is NOT persisted), AND
- The session is resumed without the flag.

In that case, the user's last explicit intent (off) is lost because the only persisted entry is the flag-set mode.

## 3. Call-Path Map (all paths that set discuss mode)

```
session_start
├── --dm-off flag ──▶ setDiscussMode("off") ──▶ persistDiscussOverride() ──▶ guarded, NOT persisted
├── --dm-block ─────▶ setDiscussMode("block") ──▶ persistDiscussOverride() ──▶ persisted ✅
├── --dm-read ──────▶ setDiscussMode("read") ──▶ persistDiscussOverride() ──▶ persisted ✅
└── no flag ────────▶ restore from getEntries().pop()

activateDiscussMode(mode, ctx, delivery)   [called by slash commands AND inline directives]
├── setDiscussMode(mode) ──▶ persistDiscussOverride()
│   ├── mode="read"  ──▶ persisted ✅
│   ├── mode="block" ──▶ persisted ✅
│   └── mode="off"   ──▶ guarded, NOT persisted ❌
├── updateDiscussStatus(ctx, mode)
├── ctx.ui.notify(...)
└── pi.sendMessage({customType: "discuss-mode", ...})

Deferred follow-up (message_start)
└── activateDiscussMode(deferred.mode, ctx, "queued")   [same path as above]
```

**Every path that sets `off` ends at the guard and is dropped.**

## 4. Why "Just Remove the Guard" Is Correct but Needs Nuance

Removing `if (activeDiscussMode.mode === "off") return;` makes `setDiscussMode("off")` persist. This is correct because:

1. **Flag override precedence is already handled.** In `session_start`, the flag checks (`dmOff`, `dmBlock`, `dmRead`) run *before* the `lastDiscuss` restore. So a persisted off-tombstone only takes effect when no `--dm-*` flag is present — exactly when the user wants "restore my last state."

2. **`--dm-off` now writes an entry.** Previously: fresh `--dm-off` start → zero discuss entries. After: one off entry. This is a minor side effect but semantically correct (the user explicitly chose off).

3. **Queued `-do:` persists at activation, not input.** The deferred follow-up path calls `activateDiscussMode` at `message_start`, so the off-tombstone is written when the queued message activates. This matches existing read/block queued behavior (they also persist at activation). No new inconsistency.

## 5. What the Fix Does NOT Change

| Aspect | Before | After |
|--------|--------|-------|
| `--dm-read` on fresh session | Persists `read` | Persists `read` (unchanged) |
| `--dm-block` on fresh session | Persists `block` | Persists `block` (unchanged) |
| `--dm-off` on fresh session | Does NOT persist | Persists `off` (new, correct) |
| `/focus-discuss off` in-session | Does NOT persist | Persists `off` (new, correct) |
| `-do:` in-session (immediate) | Does NOT persist | Persists `off` (new, correct) |
| `-do:` in-session (queued) | Does NOT persist | Persists `off` at activation (new, correct) |
| Resume without flags, last entry = read | Restores read | Restores read (unchanged) |
| Resume without flags, last entry = off-tombstone | Restores read (BUG) | Restores off (FIXED) |
| Enforcement semantics (which tools blocked) | Per mode | Per mode (unchanged) |
| Model-visible message on transition | "Strict-Discuss mode ended by user." | Same (unchanged) |
| Footer icon on off | ✅ | ✅ (unchanged) |

## 6. Residual Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| ~~Test mock may not support pre-populated `session_start` entries~~ **Resolved** | — | Confirmed: `sessionManager.getEntries` in `test/focus-guard.test.ts` is a `vi.fn().mockReturnValue([...])` (L124–126, L182–183, L194–196); the T1–T10 test plan is directly implementable |
| Session files with only `read` entries (pre-fix sessions) will still restore to `read` | Low (by design) | These sessions had no explicit off, so restoring `read` is correct |
| Very long session with many discuss-mode entries grows the file | Negligible | Each entry is ~50 bytes; even 100 transitions = ~5KB |
| Fork/branch file-order `.pop()` | Medium (accepted limitation) | `getEntries()` returns file-order, not leaf-DFS. On a forked session, `.pop()` may return a discuss-mode entry from an abandoned branch. **Not verified** that Pi exposes leaf-scoped entry access (unverified negative, not a confirmed absence); the fix does not worsen fork behavior (same `.pop()` as before) |
| `explicit` field is dead weight | Low (informational) | Written at L56/L208 and round-tripped on restore, but never read by enforcement or restore logic. FR-7 preserves shape consistency only; no restore rule keys on it |

## 7. Evidence Log

| Claim | Evidence | Verified? |
|-------|----------|-----------|
| `persistDiscussOverride` guards off | `src/focus-guard.ts` L176 | ✅ Read in session |
| `session_start` restore uses `.pop()` on custom entries | `src/focus-guard.ts` L513–518 | ✅ Read in session |
| `session_start` fires on resume | `agent-session-runtime.js` L141: `{ type: "session_start", reason: "resume" }` | ✅ Read in session |
| `getEntries()` returns persisted custom entries | `session-manager.js` L1107: `this.fileEntries.filter(e => e.type !== "session")` | ✅ Read in session |
| `appendEntry` writes to session file | `session-manager.js` L815: `_appendEntry` → `appendFileSync` | ✅ Read in session |
| Flag checks run before restore in `session_start` | `src/focus-guard.ts` L484–518: `dmOff`/`dmBlock`/`dmRead` blocks precede `else` with `lastDiscuss` | ✅ Read in session |
| `activateDiscussMode` calls `setDiscussMode` → `persistDiscussOverride` | `src/focus-guard.ts` L219–220 | ✅ Read in session |
| Queued directives call `activateDiscussMode` at `message_start` | `src/focus-guard.ts` L551–553 | ✅ Read in session |

## 8. Open Questions (Carried to Plan Phase)

1. ~~**Test infrastructure:**~~ **Resolved:** `test/focus-guard.test.ts` uses `vi.fn().mockReturnValue([...])` for `sessionManager.getEntries` — pre-populating entries for `session_start` tests is already supported (confirmed by reading the test file, lines 124–126, 182–183, 194–196). The T1–T10 test plan is directly implementable.
2. **Existing test inversion:** `test/focus-guard.test.ts:512` (`"keeps inline -do: as a non-persisted session override"`) asserts `appendEntry` is NOT called with `{ mode:"off", explicit:true }`. Removing the L176 guard makes this test **fail**. It must be renamed and its assertion inverted to expect the off-tombstone.
3. **Test-plan depth (round-2 finding):** A pre-populated `[read, off]` `session_start` test alone is **insufficient** regression protection — it would pass even without touching `persistDiscussOverride` (the entry already exists in the mock). The real protection is an end-to-end test: call `activateDiscussMode("off")`, take the recorded mock entries, feed them into a fresh `session_start`, and assert restored mode is `off`. (Added as T10 in requirements; T3/T3b cover the `--dm-off` persistence side.)
4. **`explicit` field is dead weight (round-2 finding):** written at L56/L208, round-tripped on restore, but never read by enforcement or restore logic. FR-7 is shape-preservation only — do not build restore semantics on it without first defining a rule.
5. **Parity matrix update:** The lifecycle invariant section should be updated to state that `off` is now persisted when explicitly set, and that the last persisted entry (including off) wins on resume.
6. **README update:** The line "off remains a session-only override and is not persisted" must be revised to reflect the new behavior.
5. **`pi.appendEntry` runtime binding (low risk):** The extension-facing `pi.appendEntry(type, data)` is assumed to map 1:1 to `sessionManager.appendCustomEntry` which stores `{ type: "custom", customType: type, data: data }`. The mock confirms this shape; the actual binding in the installed Pi dist was not traced to source. Risk: low (mock faithfully mirrors the SDK contract, restore code was written against it).
