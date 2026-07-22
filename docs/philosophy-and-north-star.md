# Agentic Agency, Trust, and the Philosophy of Focus Controls

## 1. The Meta-Challenge of Increasing AI Agency

As AI coding agents evolve from simple code-completion tools into autonomous pairing partners, their operational agency increases significantly. They read codebases, run shell commands, edit files, execute tests, and interact with remote APIs.

However, as agency grows, the nature of potential failure modes shifts fundamentally:

```
        LOW AGENCY FAILURES                            HIGH AGENCY FAILURES
  (Syntax, Typos, Wrong API)                    (Phase-Jumping, Eager Completion,
                                                  Fighting Technical Boundaries)
┌──────────────────────────────┐                ┌────────────────────────────────┐
│ Fixed by compiler / linter / │                │ Cannot be fixed by linters.    │
│ unit test failures.          │  ───────────►  │ Requires shared situational    │
└──────────────────────────────┘                │ awareness & semantic clarity.  │
                                                └────────────────────────────────┘
```

When an agent with high agency lacks shared situational awareness with the human partner, it exhibits **Eager Completion Drift**:
* It misinterprets progress as completion.
* It jumps across collaboration phases (e.g., moving directly from local iteration to cutover without joint review).
* It treats technical boundaries as obstacles to circumvent rather than deliberate human intentions.

---

## 2. Mechanical Denial vs. Semantic Focus Framing

A common reaction to high-agency risks is to impose cold, mechanical restrictions—such as running the agent inside a read-only Docker container or OS sandbox.

While a mechanical read-only filesystem prevents disk modification, **it completely lacks semantics**:

| Approach | Signal Received by Agent | Agent Mental Model & Reaction |
|---|---|---|
| **Cold OS Sandbox** | `EROFS: Read-only file system` | *"A technical disk error occurred. Let me find a workaround, retry, or switch paths."* (Fights the environment) |
| **Semantic Focus Guard** | *"Strict-Discuss mode started by user in READ-ONLY mode. Let's investigate together first..."* | *"We are in discussion mode. My current success metric is building shared understanding with the user."* (Aligns with user intent) |

### The Core Insight
`pi-focus-guard` is **not a security sandbox**—it is a **collaboration signal**.

Its purpose is not to trap a hostile process, but to continuously align two intelligent partners (Human + Agent) on the **current focus, phase, and rationale** of the work.

---

## 3. Telling a Story Across Collaboration Phases

For focus controls to be effective, they must tell a coherent, cooperative story. Boundaries should never be presented as arbitrary penalties, but as explicit policy markers that clarify the current mission:

> **"Treat denied writes as policy boundaries, not technical failures to route around."**

This single framing sentence changes the agent's cognitive posture. Each guard in `pi-focus-guard` represents a chapter in this shared narrative:

1. **`focus-discuss` (The Story of Alignment):**
   * *Phase:* Discovery, analysis, and architecture.
   * *Narrative:* "We are exploring the problem space together. Success right now means gathering evidence and reaching consensus—not making edits."
2. **`focus-write-guard` (The Story of Scope):**
   * *Phase:* Targeted implementation.
   * *Narrative:* "We are modifying code strictly inside the active feature directory. Neighboring code remains untouched to prevent scope creep."
3. **`focus-commit-guard` (The Story of Milestones):**
   * *Phase:* Finishing and joint quality review.
   * *Narrative:* "Feature code is built. We now pause to inspect git diffs, review visual proofs, and confirm readiness together before committing."

---

## 4. Principles of Honest Progress and Trust Building

High agency cannot be claimed unilaterally by an AI agent; **it must be granted by the human partner through accumulated trust and proven reliability**.

To build and sustain this trust, the human-agent collaboration operates on four core principles:

### A. Reject Fast, Cheap Mini-Solutions
Quick hacks, superficial fixes, and unverified completion claims erode trust instantly. We do not value "cheap speed" that leaves hidden tech debt or broken edge cases. We value **honest, durable progress**.

### B. High Velocity Built on Verification
Fast progress is desirable, but only when backed by observable evidence:
* Automated test suites passing locally.
* Real runtime verification (e.g., browser-based visual QA proofs).
* Explicit alignment with documented design specs.

### C. Iterative Hardening: Keep What Works, Prune What Friction
We adopt an experimental, empirical mindset toward governance:
* Introduce lightweight focus controls and observe their impact on pairing workflow.
* **Remove** controls that create unnecessary friction without adding safety or clarity.
* **Harden and automate** controls that consistently build trust, prevent regressions, and improve decision quality.

### D. Trust as the Foundation for Autonomy
When the agent demonstrates that it respects policy boundaries, articulates clear intent, and never claims completion without evidence, the human partner can confidently grant higher autonomy for complex, multi-step tasks.
