# pi-focus-guard

Successor Pi extension that groups the existing focus-related guard rails under one clear command family.

`pi-focus-guard` is intended to replace the separate `pi-write-guard` and `pi-discuss-mode` extensions. The core idea is not to invent new semantics, but to make the related controls visibly belong together by exposing them under `/focus-*` commands.

## Intent

When collaborating with an agent, the user often wants to control the working mode at a conversational level:

- Are we discussing only, or may the agent act?
- If the agent may act, where may it write?
- Are we still reviewing and finishing collaboratively, or may the agent commit?

The extension makes those mode boundaries explicit and visible in one namespace.

## Rationale

The old extensions solve related problems but appear as unrelated command families:

- `pi-write-guard` controls where writes may happen.
- `pi-discuss-mode` controls whether tool use is allowed at all.

In practice, both are focus controls: they communicate user intent about the current collaboration phase. A unified extension reduces command discovery friction and makes session state easier to reason about.

## North Star & Philosophy

`pi-focus-guard` is grounded in a meta-level vision for human-agent pairing: **focus controls are semantic collaboration signals, not cold security blockades.**

* **Shared Situational Awareness:** Cold filesystem restrictions (like read-only OS sandboxes) give zero semantic context, causing AI agents to view boundaries as technical bugs to route around. `pi-focus-guard` communicates *why* a boundary exists, telling a clear narrative story across collaboration phases.
* **Telling a Story:** Every guard banner and reminder message explicitly frames boundaries as policy agreements ("*Treat denied writes as policy boundaries, not technical failures to route around*").
* **Honest Progress Over Cheap Shortcuts:** We reject fast, superficial mini-solutions and hacks in favor of verified, high-quality, durable progress.
* **Iterative Hardening:** We continuously observe what works in practice, prune friction that adds no value, and harden the mechanisms that build mutual trust and reliability.

For the detailed meta-level framework on agentic agency and trust, see [`docs/philosophy-and-north-star.md`](docs/philosophy-and-north-star.md).

The intended command shape is:

```text
/focus-write-guard ...
/focus-write-guard-all
/focus-discuss ...
/focus-discuss-off
/focus-discuss-read
/focus-discuss-block
/focus-commit-guard
/focus-commit-guard-on
/focus-commit-guard-off
```

Startup flags can set the initial mode:

```text
--write-guard <dirs>
--write-guard-all
--write-guard-off
--dm-off
--dm-read
--dm-block
--commit-guard
--commit-guard-on
--commit-guard-off
```

Explicit `off` flags override persisted state for their guard.

Discuss mode can also be changed inline while submitting a request:

```text
-do: implement the change
-db: explain the architecture
-dr: investigate the issue

Please investigate what needs to be done.
-dr:
```

The directive is removed before the request is processed. Only one directive is allowed per message. A directive-only message changes the mode without starting an agent turn. `-do:` matches `/focus-discuss-off`: it disables discuss mode for the current session but does not persist an `off` override. Inline directives are processed for interactive and RPC input, not extension-generated messages.

## Scope

### Preserve existing behavior while porting

The write-guard and discuss-mode logic should be ported without behavioral adaptation. The successor should keep the existing semantics from the source extensions unless a later change is explicitly requested.

That means:

- Write allowlist behavior should match `pi-write-guard`.
- Bash write detection should match `pi-write-guard`.
- Discuss block/read/off behavior should match `pi-discuss-mode`.
- Read-only bash classification should match `pi-discuss-mode`.
- Existing denial-message intent should remain cooperative: denied actions are policy boundaries, not technical failures to route around.

### New behavior: commit guard

`pi-focus-guard` adds one new guard:

```text
/focus-commit-guard
/focus-commit-guard-on
/focus-commit-guard-off
```

When enabled, bash commands containing `git commit` are blocked.

The block message should explain that the user intentionally does not want commits yet, because the collaboration phase is still about finishing together, reviewing the diff, and deciding when the milestone is ready.

The commit guard also exposes a footer status icon, matching the style of the discuss and write guards, so the user can see at a glance whether premature commits are currently blocked: `📝` means commit guard is off, `🚫` means commit guard is on.

This guard is not a security boundary. It is a collaboration signal that prevents premature commits and encourages review before finalizing work.

## Successor plan

`pi-focus-guard` is planned as the effective successor to:

- `pi-write-guard`
- `pi-discuss-mode`

Those older extensions can be deprecated later after parity is verified.

## Non-goals for the initial port

- Do not redesign write-guard policy semantics.
- Do not redesign discuss-mode policy semantics.
- Do not silently add new config precedence rules; startup flag precedence is explicit: off flags override on/read/block flags and persisted state for that guard.
- Inline discuss directives change the current session mode without changing the existing persistence semantics.
- Do not keep legacy command names unless explicitly chosen later.
- Do not treat denied writes or blocked commits as errors to work around.

## Verification expectations

Before treating this successor as ready, tests should show parity for:

- focus-prefixed command registration;
- startup flag registration and initial-mode behavior;
- write/edit path allowlist blocking;
- bash write detection;
- discuss block mode;
- discuss read mode;
- read-only bash allowance;
- `/focus-commit-guard` printing commit guard status;
- commit guard blocking `git commit` while enabled;
- commit guard allowing non-commit bash when enabled;
- commit guard allowing `git commit` when disabled;
- commit guard footer icon reflecting enabled/disabled state.
