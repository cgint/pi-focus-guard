# Known limitation — `sendUserMessage` throws during compaction

Date: 2026-10-11 · Status: **open (upstream)** · Scope: pi-focus-guard submit path
(related pattern in pi-mini-self-org `user-pin-submit`, same root cause)

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

## Upstream references

- [#8435](https://github.com/earendil-works/pi/issues/8435) — "sendUserMessage
  during compaction throws instead of queueing (inconsistent with streaming
  behavior)" (open)
- [#8687](https://github.com/earendil-works/pi/issues/8687) — `deliverAs:
  followUp/steer` throws 'already processing' during active run (queue bypassed)
- [#6820](https://github.com/earendil-works/pi/issues/6820) / [#6728](https://github.com/earendil-works/pi/issues/6728)
  — TUI's own `flushCompactionQueue` races the resumed agent and can drop
  queued messages ("Agent is already processing")

## Why no extension-side workaround (deliberate)

A catch-and-retry on `compaction_end` is possible (catch the specific
compaction error, stash the pending submit, re-fire on `compaction_end` with
an `aborted` check) but is rejected as the design because:

1. It duplicates queue state the core already owns (the TUI buffer), and would
   have to be deleted when upstream lands — a two-repo divergence.
2. Even after #8435 is fixed, #6820's flush race means post-compaction delivery
   is not bulletproof; the extension-side buffer inherits the same race.
3. It is a hack by this repo's standard: the submit path is correct for the
   non-compaction case (the 99.9% case); the compaction case is a core
   limitation, not a feature defect.

## Proper fix (upstream)

`prompt()` should route `streamingBehavior === "followUp"` into `_queueFollowUp`
*before* the compaction guard (guard reorder + regression test), and the
`flushCompactionQueue` race (#6820) needs fixing so queued-after-compaction
delivery is reliable. Until both land, extensions cannot queue user messages
across compaction via the public API.

## Mitigation today

If a submit lands mid-compaction, the goal is already armed; only the trigger
turn is missing. The clean recovery is to send the goal definition as an
ordinary user message after compaction finishes (a plain prompt starts the
turn — no re-arm needed). Re-running `/focus-goal-start-submit` also works but
is *not* idempotent: it re-arms (harmless, a set) **and** re-sends a second
"Goal started" custom message plus a second user turn. Alternatively, let the
next turn end's `agent_end` nudge carry the goal forward — no action required.
