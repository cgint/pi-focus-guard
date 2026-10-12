# Known limitation — `sendUserMessage` throws during compaction

Date: 2026-10-11 (upstream status updated 2026-10-11) ·
Status: **live in pinned pi-coding-agent 1.1.0; upstream #8435 unresolved (auto-closed, not maintainer-adjudicated)** ·
Scope: pi-focus-guard submit path (related pattern in pi-mini-self-org
`user-pin-submit`, same root cause)

## Symptom

Running `/focus-goal-start-submit <definition>` (or `/focus-goal-suggest`) while a
session compaction is in flight surfaces:

```
Extension "<runtime>" error: Cannot submit a prompt while compaction is in
progress. Wait for compaction to finish and retry.
```

The goal **is armed** (`activeGoal` set, status icon, "Goal started" custom
message) — but the trigger user-message is dropped. The agent is not started
on the goal until the next natural turn end (where the `agent_end` nudge
re-arms the cross-check).

## Root cause

In `@earendil-works/pi-coding-agent@1.1.0`, `AgentSession.prompt()` guards:

```js
if (this._compactionAbortController !== undefined)
  throw new Error("Cannot submit a prompt while compaction is in progress. ...");
```

This runs **before** the `streamingBehavior` routing, so
`pi.sendUserMessage(text, { deliverAs: "followUp" })` (which maps to
`prompt(text, { streamingBehavior: "followUp" })`) never reaches the
`_queueFollowUp` branch. The extension's idle/busy split is moot:
`ctx.isIdle()` returns `false` during compaction (`isIdle =
!_isAgentRunActive && !isCompacting`), so the code always takes the
`followUp` branch — and always throws.

The interactive TUI avoids this via an internal buffer
(`queueCompactionMessage(text, "followUp")`, flushed on `compaction_end`),
but that buffer is **not exposed** to the extension API.

## Upstream references (status verified 2026-10-11 via `gh api`)

- [#8435](https://github.com/earendil-works/pi/issues/8435) — "sendUserMessage
  during compaction throws instead of queueing." **Closed `not_planned` on
  2026-08-21, but auto-closed by `github-actions[bot]` (new-contributor default),
  NOT a maintainer product decision.** No fix in the 1.1.0 dist this repo pins
  (guard re-verified present). May be reopened by daily maintainer review.
- [#6728](https://github.com/earendil-works/pi/issues/6728) — TUI
  `flushCompactionQueue` races the resumed agent and drops queued messages.
  **Fixed on main** (maintainer `badlogic`: "Fixed on main") — the flush race
  has a real upstream fix, though it may not be in 1.1.0 yet.
- [#6820](https://github.com/earendil-works/pi/issues/6820) — queued message
  dropped after threshold auto-compaction. Auto-closed (new-contributor
default); author actively contesting the `no-action` label.
- [#8687](https://github.com/earendil-works/pi/issues/8687) — `deliverAs:
  followUp/steer` throws 'already processing' during an *active run* (not
  compaction). Closed "cannot reproduce" by a contributor (contested); the
  1.1.0 dist still exhibits the active-run throw, so treat as unresolved for
  our purposes.

**Net:** #8435 was closed `not_planned` on 2026-08-21. The extension-side retry
pattern is the intended, permanent solution — not a temporary workaround awaiting
an upstream fix. Upstream has explicitly punted this to extensions.

## Extension-side retry pattern (intended solution, not yet implemented)

Because #8435 was closed `not_planned` (upstream explicitly declined to fix), the
extension-side retry is the *intended* pattern, not a rejected hack. The pattern
(used by #8687's author and others): gate delivery on `agent_settled`
+ `ctx.isIdle()` + try/catch on the compaction error, then re-fire the stashed
submit on `compaction_end` (checking `aborted`).

It is **not implemented here yet** — a deliberate deferral, not a rejection:

1. **Scope:** the compaction-in-flight submit is a rare edge (the 99.9% case is
   non-compaction, where the current path is correct). Adding retry state to
   handle a rare transient phase is not worth it until the feature needs it.
2. **Race surface:** a self-maintained buffer duplicates queue state the core
   owns and reintroduces a #6820-style flush race unless carefully ordered
   against `compaction_end`/`agent_settled` and the `aborted` flag.
3. **Revisit trigger:** if a goal/pin is repeatedly lost mid-compaction in real
   use, implement the retry then (this doc is the spec). The #6728 flush-race
   fix landing in a pi release would lower the risk of doing so.

## Upstream fix (not planned — extension responsibility)

`prompt()` should route `streamingBehavior === "followUp"` into `_queueFollowUp`
*before* the compaction guard (guard reorder + regression test). #6728's flush
race is already fixed on main. Until the guard reorder lands, extensions cannot
queue user messages across compaction via the public API — so the working
extension-side pattern above is the interim reality.

## Mitigation today

If a submit lands mid-compaction, the goal is already armed; only the trigger
turn is missing. The clean recovery is to send the goal definition as an
ordinary user message after compaction finishes (a plain prompt starts the
turn — no re-arm needed). Re-running `/focus-goal-start-submit` also works but
is *not* idempotent: it re-arms (harmless, a set) **and** re-sends a second
"Goal started" custom message plus a second user turn. Alternatively, let the
next turn end's `agent_end` nudge carry the goal forward — no action required.
