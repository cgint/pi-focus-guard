# Discuss Mode Resume-Restore Bug — Investigation

## Problem Statement

When a session starts with `--dm-read`, the user switches off discuss mode in-session (via `/focus-discuss-off` or `-do:`), then exits and resumes with `pi --session <file>` (without `--dm-read`), the discuss-mode-read state is **back ON** despite the user having explicitly turned it off.

The conversation history confirms the off-state was active during the session (visible `[discuss-mode]` messages and UI notifications prove it), but the persisted state in the session file still reflects the earlier `read` mode.

## Root Cause

`src/focus-guard.ts` has a **persistence asymmetry** between modes:

```
setDiscussMode(mode)
  ├── mode = "read"  → appendEntry("discuss-mode", { mode: "read", explicit: true })  ✅ persisted
  ├── mode = "block" → appendEntry("discuss-mode", { mode: "block", explicit: true }) ✅ persisted
  └── mode = "off"   → guarded by `if (mode === "off") return` → NOTHING persisted      ❌ lost
```

At `session_start` on resume, restore logic does:
```ts
const lastDiscuss = entries.filter(e => e.customType === "discuss-mode").pop();
if (lastDiscuss?.data) activeDiscussMode = lastDiscuss.data;
```

Since `off` was never written, `.pop()` returns the last persisted entry — the `read` from startup. Restore resurrects it.

### Why "off" is not persisted (by design)

From README: *"off remains a session-only override and is not persisted."* This was inherited from legacy `pi-discuss-mode`. The original design intent was: the **default** state is off, so persisting "off" would be redundant. But this assumption breaks when the active mode was explicitly set to `read` or `block` by a startup flag and then the user *explicitly turns it off* — the off is a meaningful state change that should survive.

## Options

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **1. Persist off-tombstone** | Remove the guard; always persist the last user-set mode, including `off` | Minimal change (remove 1-line guard); last user intent always wins on resume; symmetric semantics | Slightly more entries in session file; need to distinguish "user explicitly chose off" from "default off" for the startup flag override logic |
| **2. Don't persist flag-set modes** | Only persist modes set via slash command / inline directive; flag-initiated modes are session-scoped | Clean: persisted state always reflects explicit user intent | `--dm-read` would not survive resume even if user never touched it — changes existing behavior for flag users; larger semantic change |
| **3. Flag sets `explicit: false`, commands set `explicit: true`** | Persist flag modes with `explicit: false`; on resume, only restore if `explicit === true` OR if it was the only entry | Preserves flag behavior for resume *unless* user explicitly overrides | More complex restore logic; `explicit` field already exists but isn't used in restore currently |

## Recommendation

**Option 1** is the simplest correct fix:

1. Remove the `if (mode === "off") return;` guard in `persistDiscussOverride()`.
2. The existing startup-flag override logic already handles the priority: `--dm-off` / `--dm-read` / `--dm-block` flags **override** persisted state (they run before the `lastDiscuss` check). So a persisted `off` entry only takes effect when no explicit flag is given — exactly the desired behavior.
3. Add a test: simulate resume with a session file containing `[read-entry, off-entry]` and assert mode is `off`.
4. **Invert** the existing test `"keeps inline -do: as a non-persisted session override"` (`test/focus-guard.test.ts:512`) to assert the off-tombstone IS persisted.

No API changes needed. The `appendEntry` / `getEntries` plumbing already works correctly.

## Open Questions

- Does the user want `off` to also be the *display* state on the footer at restore (currently the restore path calls `updateDiscussStatus` with the restored mode, so it would show ✅ — already correct)?
- Should the off-tombstone also emit a model-visible `[discuss-mode]` message on restore? (Currently restore doesn't emit one — it just silently sets state. Probably fine: the session history already contains the prior "ended" message.)
- **Fork/branch limitation:** `getEntries()` is file-order, not leaf-DFS. On a forked session, `.pop()` may return an entry from an abandoned branch. Accepted as documented limitation; no Pi API for leaf-scoped entry access confirmed.
