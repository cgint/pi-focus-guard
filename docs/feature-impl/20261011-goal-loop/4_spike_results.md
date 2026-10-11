# goal-loop — spike results

Date: 2026-10-11 (spike A) · Status: **spike (mechanism verified)** · Owner: Firstmate (worker: spike-goal)

> Fills the "primary gate" of `3_plan__goal-loop.md` → "Open technical unknowns" #1:
> confirm that `pi.on("agent_end")` + `pi.sendMessage(text, { triggerTurn: true, deliverAs: "steer" })`
> fires a continuation turn on this host (Pi 1.1.0).

## Verdict

CONFIRMED. On Pi 1.1.0 (host version of this machine; package.json peerDeps `>=0.74.0`, devDeps `^1.0.0`),
a steer message queued from an `agent_end` handler re-triggers `agent_end` — i.e. the steer caused a
genuine new LLM turn to run and end. This is the exact idiom `pi-self-reflect` and
`pi-subagent-herdr`'s agent-end-pane-reminders use.

## Method

- Probe extension: `~/.pi/extensions/goal-spike-probe.ts` (session-scoped to the probe session;
  auto-arms on first `agent_end`, auto-disarms after 2 continuations — bounded, cannot loop).
- Test session: `herdr` workspace `w0f`, tab `t0` (Pi 1.1.0 TUI session), probe enabled.
  Session id: `9744b01a-9e88-438c-b91d-1307f9597960`.

## Evidence (session transcript)

- Message 4: `agent_end` fires for a normal LLM reply ("ok") — turn ends as usual.
- Message 5: `message` with `role: "user"`, `content` = probe's steer text,
  `deliveryMode: "steer"`, `source: "extension"` — the queued steer was delivered.
- Message 6: `agent_end` fires again (the continuation turn's end).
- Message 7: second steer (probe's disarm nudge), Message 8: second `agent_end`.

## Additional finding — OQ2 (re-entrancy predicate)

`MessageSource` for extension-originated messages includes `"extension"` (verified in Pi 1.1.0's
`pi-coding-agent/dist/types.d.ts`). So the re-entrancy predicate for goal-loop v1's latch is exact:
an input whose source is `"extension"` (or the steer delivery) is extension-originated, not genuine
user input. (Plan item #2 is therefore answerable at implementation time without a separate spike.)

## Disposition

Probe pane closed after evidence capture. No repo files created (scratch-only spike per assignment).
