# Inline Discuss-Mode Lifecycle Fix — Handoff

## Status

The committed inline directives (`-do:`, `-db:`, `-dr:`) work for an idle prompt but have two lifecycle defects. Do **not** treat the current implementation as complete.

Baseline verified before this handoff:

```text
npm test           # 115 passing
npm run typecheck  # passing
git status         # clean
```

## User-facing defects

### 1. Queued follow-up changes mode too early

Reproduction:

```text
-do: pls update             # starts active execution in mode off
-dr: hello                  # submitted as a queued follow-up while agent works
```

Current behavior: `-dr:` immediately changes the global guard to read-only, blocking the still-running `pls update` request.

Required behavior:

```text
-do: pls update             # mode off takes effect now
-dr: hello (follow-up)      # directive is queued; mode remains off
hello starts                # read mode takes effect immediately before its model turn/tools
```

### 2. Inline mode changes are invisible to the model

Current inline handling only calls `ctx.ui.notify(...)`, which appears in the TUI but is not part of LLM context. The model can retain stale planning/discuss context and refuse an otherwise allowed `-do:` request.

Slash commands do the required additional work:

```text
[discuss-mode]
Strict-Discuss mode ended by user.
```

They create this with:

```ts
pi.sendMessage(
  { customType: "discuss-mode", content: "...", display: true },
  { triggerTurn: false },
);
```

Pi documents that `pi.sendMessage()` custom messages participate in LLM context. Inline transitions must give the model equivalent context.

## Required invariant

A mode transition is effective for a request only when all of these are aligned:

```text
mode enforcement
+ footer/UI status
+ mode-specific persistence
+ model-visible [discuss-mode] custom message
```

Persistence remains deliberately mode-specific:

- `read` and `block`: persist `{ mode, explicit: true }`.
- `off`: session-only override; do **not** append an `off` persistence record.

## Current implementation

Relevant files:

| File | Role |
|---|---|
| `src/focus-guard.ts` | Guard state, slash commands, inline `input` hook, tool policy. |
| `src/discuss/input-directive.ts` | Pure parser for prefix/trailing directives and duplicate rejection. |
| `test/focus-guard.test.ts` | Extension event/mock integration tests. |
| `test/discuss-input-directive.test.ts` | Parser tests. |

The problematic current flow in `src/focus-guard.ts` is:

```text
input event
  → parse directive
  → applyInlineDiscussMode() immediately
  → UI notification only
  → return cleaned text
```

`applyInlineDiscussMode()` currently updates enforcement, status, and UI—but not model context.

## Verified Pi lifecycle evidence

From Pi `0.81.1` installed extension/runtime code:

```text
AgentSession.prompt()
  → input hook runs before skill/template expansion
  → if currently streaming, cleaned input is queued via agent.followUp()

Queued follow-up delivery
  → agent.continue()
  → queued user message emits message_start
  → next model turn begins
```

Important constraints:

1. `before_agent_start` runs for a new top-level `AgentSession.prompt()`, but **not** when `agent.continue()` drains queued follow-ups.
2. A queued user message emits `message_start` before its next model turn.
3. Pi `context` hooks run before each LLM call and can return a modified message array.
4. `pi.sendMessage()` during streaming defaults to `steer`; its delivery timing must be verified in a runtime-oriented test before relying on it for queued follow-up context.
5. `deliverAs: "nextTurn"` is consumed by the next top-level prompt, not proven suitable for an `agent.continue()` follow-up.

Do not use hidden user-prompt markers, direct `node_modules` edits, timing delays, or manual lockfile-style workarounds.

## Recommended design

### Separate parsing from activation

```text
input hook
  → parse and remove directive
  → immediate/steer request: activate now
  → follow-up request: enqueue transition metadata only

queued user message_start
  → consume matching queued metadata
  → activate transition before next model turn
```

### One transition helper

Replace duplicated slash/inline side effects with one helper conceptually equivalent to:

```text
activateDiscussMode(mode, ctx, delivery)
  1. update activeDiscussMode
  2. persist read/block only
  3. update footer status
  4. notify UI
  5. emit the canonical [discuss-mode] custom message for model context
```

The helper must use the same mode wording as slash commands so model and user see identical semantics.

### Deferred follow-up tracking

Track **every** `streamingBehavior === "followUp"` input in FIFO order, not only directive inputs. Each record needs at least:

```ts
{ mode?: DiscussMode }
```

Why every follow-up matters:

```text
plain follow-up
then -dr: follow-up
```

If only directives are queued locally, the `-dr:` transition would be consumed at the plain message start and activate too early.

At queued user `message_start`, consume exactly one queued record. If it has `mode`, activate it. Clear deferred records when the agent settles and on session replacement/shutdown to prevent an aborted/cleared queue from leaking a stale transition into a later prompt.

Use a defensive mismatch strategy for unexpected user-message ordering; fail closed by discarding stale deferred metadata rather than applying a mode to an unrelated request.

## Required tests

Add tests before implementation (green → red → green):

1. **Inline immediate model context**
   - `-do: pls update` returns cleaned text.
   - It emits the canonical `discuss-mode` custom message, not only a UI notification.
   - It does not persist `off`.

2. **Queued follow-up timing**
   - Start with active mode `off`.
   - Submit `-dr: hello` with `streamingBehavior: "followUp"`.
   - Assert read mode does not apply at input submission.
   - Trigger queued user `message_start`.
   - Assert read mode then applies before a write-like tool call.

3. **Model context parity for queued activation**
   - Assert a canonical `discuss-mode` custom message is injected/delivered before the queued request’s next LLM turn.
   - Use Pi’s documented behavior or a runtime-oriented integration test; do not assume event timing.

4. **FIFO alignment**
   - Queue a plain follow-up then a `-dr:` follow-up.
   - First user `message_start`: mode unchanged.
   - Second user `message_start`: read mode applies.

5. **Steer behavior**
   - A directive delivered as `streamingBehavior: "steer"` changes mode immediately.

6. **Queue cancellation cleanup**
   - Queue a directive follow-up.
   - Simulate agent settling/queue discard.
   - A later plain user message must not apply the discarded directive.

7. **Existing behavior regression**
   - Slash `off/read/block` retains custom-message behavior.
   - `off` remains non-persisted.
   - Parser syntax/duplicate rejection remains unchanged.

## Documentation changes after implementation

Update `README.md` and `docs/parity-matrix.md` to state:

- queued follow-up directives activate when their request begins, not when queued;
- every effective transition produces model-visible discuss-mode context;
- `off` remains non-persisted.

## Dependency/audit constraint

`npm audit --audit-level=moderate` remains blocked by `protobufjs@7.6.4` shrinkwrapped inside latest Pi `0.81.1`.

- Tracking issue: <https://github.com/earendil-works/pi/issues/7005>
- Production audit (`npm audit --omit=dev`) is clean.
- Follow-up is recorded in root `AGENTS.md`.
- Do not suppress the audit, hand-edit the lockfile, or patch `node_modules`.
