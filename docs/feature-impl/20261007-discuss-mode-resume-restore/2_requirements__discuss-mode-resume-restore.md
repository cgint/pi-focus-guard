# Discuss Mode Resume-Restore Fix — Requirements

## Background

See `1_idea__discuss-mode-resume-restore.md` for the full investigation and root cause.

## Problem (one-line)

`--dm-read` persists `read`; an in-session explicit off does **not** persist; on resume without `--dm-read`, the persisted `read` is restored — the user's explicit off is silently lost.

## Functional Requirements

| ID | Requirement |
|----|-------------|
| FR-1 | When the user explicitly switches discuss mode to `off` via `/focus-discuss-off`, `/focus-discuss off`, or the inline `-do:` directive, an off-tombstone entry **must** be persisted to the session file. |
| FR-2 | On resume (`pi --session <file>` without `--dm-*` flags), the restore logic must pick up the **last** persisted discuss-mode entry, including an off-tombstone. |
| FR-3 | Startup flags (`--dm-off`, `--dm-read`, `--dm-block`) must **override** any persisted state — this behavior must not change. |
| FR-4 | A fresh session started with `--dm-off` must persist an off-tombstone (consistent with FR-1: explicit off is always persisted). |
| FR-5 | A fresh session started with `--dm-read` or `--dm-block` must continue to persist the flag-set mode (no change from current behavior). |
| FR-6 | A fresh session started with no `--dm-*` flag and no prior persisted entry must default to `off` (no change from current behavior). |
| FR-7 | The off-tombstone must have the same `explicit: true` flag as all other persisted discuss-mode entries. (Note: `explicit` is currently a dead field — written but never read by enforcement or restore logic. This requirement preserves shape consistency for future use but carries no enforcement meaning today.) |
| FR-8 | The model-visible `[discuss-mode]` custom message on off-transition must remain unchanged ("Strict-Discuss mode ended by user."). |
| FR-9 | The footer status icon must reflect `off` (✅) after a resume that restores an off-tombstone. |
| FR-10 | The existing test `"keeps inline -do: as a non-persisted session override"` (test/focus-guard.test.ts:512) must be inverted to assert the off-tombstone IS persisted. |

## Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | No API changes to Pi's extension interface. |
| NFR-2 | The fix must not change discuss-mode enforcement semantics (what tools are blocked in each mode). |
| NFR-3 | The fix must not change write-guard or commit-guard behavior. |
| NFR-4 | The fix must not change the inline directive parser or its duplicate-rejection behavior. |

## Explicit Non-Goals

- Do not change the persistence model for `read` or `block` modes.
- Do not add a `source` field to distinguish flag-set vs. command-set modes (Option 3 from the idea doc is **not** adopted).
- Do not change the `--dm-*` flag precedence rules.
- Do not emit a new model-visible `[discuss-mode]` message on restore (the session history already contains the prior transition message).

## Acceptance Criteria

1. **Resume after explicit off:**
   - Session started with `--dm-read`, user runs `/focus-discuss-off`, session exits.
   - Resume with `pi --session <file>` (no `--dm-*` flag).
   - Discuss mode is **off** (✅ in footer, no tool blocking).

2. **Resume after explicit off via inline directive:**
   - Session started with `--dm-read`, user submits `-do: hello`, session exits.
   - Resume with `pi --session <file>` (no `--dm-*` flag).
   - Discuss mode is **off**.

3. **Resume after no in-session change:**
   - Session started with `--dm-read`, no in-session discuss-mode change, session exits.
   - Resume with `pi --session <file>` (no `--dm-*` flag).
   - Discuss mode is **read** (📖 in footer, write/edit blocked, read-only bash allowed).

4. **Startup flag override:**
   - Session has a persisted `read` entry.
   - Resume with `pi --session <file> --dm-off`.
   - Discuss mode is **off** (flag overrides persisted state).
   - An off-tombstone is persisted (FR-4).

5. **Fresh session default (no flag):**
   - No prior session file, no `--dm-*` flag.
   - Discuss mode is **off** (default).
   - No discuss-mode entry is persisted at startup.
   - **Contrast with FR-4:** The *default* off (no flag, no prior entry) persists nothing. An *explicit* off (`--dm-off` flag or in-session command) persists a tombstone. These are distinct: FR-6 governs the default; FR-4 governs the explicit flag.

6. **Queued follow-up off-directive:**
   - Session in `read` mode, agent is streaming.
   - User submits `-do: next task` as a queued follow-up.
   - Off-tombstone is persisted at **activation time** (when the queued message starts), not at input time.
   - Consistent with existing read/block queued-directive behavior.

## Edge Cases

| Case | Expected behavior |
|------|-------------------|
| Multiple off-transitions in one session | Multiple off-tombstones persisted; restore picks the last one (off) — correct. |
| Off → read → exit → resume | Last persisted entry is `read` → restore to `read`. Correct: user's last intent was read. |
| Read → off → block → exit → resume | Last persisted entry is `block` → restore to `block`. Correct. |
| `--dm-off` on a session that already has a persisted `read` | Flag overrides: mode is off; off-tombstone is persisted (FR-4). |
| `--dm-read` on a session that already has a persisted `off` tombstone | Flag overrides: mode is read; read entry is persisted. |
| Fork from a session with off-tombstone | Fork inherits the off-tombstone; mode is off unless a `--dm-*` flag is given. **Caveat:** `getEntries()` returns file-order, not leaf-DFS order — on a forked session, `.pop()` picks the last discuss-mode entry in file order, which may be from an abandoned branch. This is a known limitation of "last entry wins" restore. |
| Fork with divergent discuss entries | Parent branch has `[read, off]`, forked branch continues with `[read, read]`. `.pop()` in file order may return `off` from the parent branch even though the active leaf is `read`. Documented as accepted limitation; fix would require leaf-scoped restore if Pi exposes it. |

## Test Plan (outline)

| Test | Scenario | Key assertion |
|------|----------|---------------|
| T1 | `session_start` with entries `[read, off]` | `activeDiscussMode.mode == "off"` |
| T2 | `session_start` with entries `[read]` | `activeDiscussMode.mode == "read"` |
| T3 | `session_start` with entries `[read]` + `--dm-off` flag | `activeDiscussMode.mode == "off"`, exactly one off-tombstone appended to the mock entry store |
| T3b | Fresh `session_start` with `--dm-off` flag, no prior entries | Exactly one off-tombstone appended (proves FR-4: explicit flag persists) |
| T4 | `session_start` with entries `[off]` + `--dm-read` flag | `activeDiscussMode.mode == "read"`, read entry persisted |
| T5 | `activateDiscussMode("off")` via slash command | off-tombstone persisted, footer shows ✅ |
| T6 | `activateDiscussMode("off")` via queued `-do:` follow-up | off-tombstone persisted at activation, not at input |
| T7 | `activateDiscussMode("read")` (regression) | read entry persisted (unchanged) |
| T8 | `activateDiscussMode("block")` (regression) | block entry persisted (unchanged) |
| T9 | Fresh `session_start`, no entries, no flags | `activeDiscussMode.mode == "off"`, no entry persisted (FR-6: default off is NOT persisted) |
| T10 | End-to-end: call `activateDiscussMode("off")` in a session that started with `--dm-read`, then simulate `session_start` with the entries the mock recorded | Restored mode is `off` — proves the full persistence→restore path, not just a pre-populated synthetic entry |

## Risks & Open Questions

- ~~**Test infrastructure:**~~ **Resolved:** The mock `sessionManager.getEntries` in `test/focus-guard.test.ts` is a `vi.fn().mockReturnValue([...])` — it already supports pre-populating entries for `session_start` tests. The T1–T10 test plan is directly implementable with the existing harness.
- **`--dm-off` side effect:** After the fix, every fresh start with `--dm-off` will write one off-tombstone entry. This is a small behavioral change (previously: zero entries). It is correct per FR-4 but should be documented in the parity matrix.
- **Queued `-do:` timing:** The off-tombstone is persisted at activation time (when the queued message starts), not at input time. This is consistent with existing read/block behavior but means the persistence timestamp reflects activation, not the user's input time.
- **Fork/branch file-order limitation:** `getEntries()` returns file-order, not leaf-DFS. On a forked session, `.pop()` may pick up a discuss-mode entry from an abandoned branch. Documented as accepted limitation (see edge cases above).
- **`pi.appendEntry` runtime binding:** The extension-facing `pi.appendEntry(type, data)` is assumed to map 1:1 to `sessionManager.appendCustomEntry`, which stores `{ type: "custom", customType: type, data: data }`. The mock confirms this shape; the actual binding in the installed Pi dist was not traced to source. Risk: low (mock faithfully mirrors the SDK contract, restore code was written against it).
