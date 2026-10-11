import { beforeEach, describe, expect, it, vi } from "vitest";
import focusGuard from "../src/focus-guard.js";
import { GOAL_MAX_LENGTH, GOAL_STATUS_KEY, GOAL_SUGGEST_PROMPT, getActiveGoal, registerGoalLoop, _resetGoalLoopForTests } from "../src/goal/goal.js";

function createPiMock() {
  const commands = new Map<string, { description: string; handler: (args: string, ctx: any) => Promise<void> }>();
  const callbacks: Record<string, Function[]> = {};
  const messages: Array<{ msg: any; opts: any }> = [];

  return {
    registerFlag: vi.fn(),
    registerCommand: vi.fn((name: string, options: { description: string; handler: (args: string, ctx: any) => Promise<void> }) => {
      commands.set(name, options);
    }),
    getFlag: vi.fn(),
    appendEntry: vi.fn(),
    sendMessage: vi.fn((msg: any, opts: any) => {
      messages.push({ msg, opts });
      return Promise.resolve();
    }),
    sendUserMessage: vi.fn((content: any, opts: any) => {
      return Promise.resolve();
    }),
    on: vi.fn((event: string, handler: Function) => {
      callbacks[event] ??= [];
      callbacks[event].push(handler);
    }),
    _commands: commands,
    _callbacks: callbacks,
    _messages: messages,
  } as any;
}

function createCtx(overrides: Partial<any> = {}) {
  return {
    hasUI: true,
    cwd: "/project",
    isIdle: vi.fn().mockReturnValue(true),
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
    },
    sessionManager: {
      getEntries: vi.fn().mockReturnValue([]),
    },
    ...overrides,
  };
}

async function invoke(pi: any, name: string, args = "", ctx = createCtx()) {
  const command = pi._commands.get(name);
  if (!command) throw new Error(`Command not registered: ${name}`);
  await command.handler(args, ctx);
  return ctx;
}

async function agentEnd(pi: any, ctx = createCtx()) {
  for (const handler of pi._callbacks.agent_end ?? []) {
    await handler({ type: "agent_end", messages: [] }, ctx);
  }
}

/** Fires only the goal-loop agent_settled handler (the last-registered one). */
async function goalAgentSettled(pi: any, ctx = createCtx()) {
  const handlers = pi._callbacks.agent_settled ?? [];
  await handlers.at(-1)({}, ctx);
}

describe("goal-loop registration", () => {
  let pi: any;

  beforeEach(() => {
    _resetGoalLoopForTests();
    pi = createPiMock();
    registerGoalLoop(pi);
  });

  it("registers the five goal commands", () => {
    expect([...pi._commands.keys()].sort()).toEqual([
      "focus-goal",
      "focus-goal-end",
      "focus-goal-start",
      "focus-goal-start-submit",
      "focus-goal-suggest",
    ]);
  });

  it("wires goal commands into the focus-guard entry", () => {
    const fullPi = createPiMock();
    focusGuard(fullPi);
    expect(fullPi._commands.get("focus-goal-start")).toBeDefined();
    expect(fullPi._commands.get("focus-goal-start-submit")).toBeDefined();
    expect(fullPi._commands.get("focus-goal-end")).toBeDefined();
    expect(fullPi._commands.get("focus-goal")).toBeDefined();
    expect(fullPi._commands.get("focus-goal-suggest")).toBeDefined();
  });
});

describe("goal-loop commands", () => {
  let pi: any;

  beforeEach(() => {
    _resetGoalLoopForTests();
    pi = createPiMock();
    registerGoalLoop(pi);
  });

  it("starts a goal via /focus-goal-start and arms the cross-check", async () => {
    const ctx = await invoke(pi, "focus-goal-start", "npm test passes and docs are updated");

    expect(getActiveGoal()).toBe("npm test passes and docs are updated");
    expect(ctx.ui.setStatus).toHaveBeenCalledWith(GOAL_STATUS_KEY, expect.any(String));
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Goal started"), "info");
    expect(pi._messages.at(-1).msg.content).toContain("Goal started by user for this session");
  });

  it("rejects a goal definition over 500 characters with a clear message", async () => {
    const definition = "x".repeat(GOAL_MAX_LENGTH + 1);
    const ctx = await invoke(pi, "focus-goal-start", definition);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      `Goal definition is ${definition.length} characters; the maximum is ${GOAL_MAX_LENGTH}. Shorten the goal and retry.`,
      "error",
    );
    expect(getActiveGoal()).toBeNull();
  });

  it("accepts a goal definition of exactly 500 characters", async () => {
    const definition = "x".repeat(GOAL_MAX_LENGTH);
    await invoke(pi, "focus-goal-start", definition);
    expect(getActiveGoal()).toBe(definition);
  });

  it("rejects an empty definition with usage help", async () => {
    const ctx = await invoke(pi, "focus-goal-start", "   ");
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Usage: /focus-goal-start"), "warning");
    expect(getActiveGoal()).toBeNull();
  });

  it("ends the goal via /focus-goal-end and disarms the cross-check", async () => {
    await invoke(pi, "focus-goal-start", "finish the migration");
    const ctx = await invoke(pi, "focus-goal-end");

    expect(getActiveGoal()).toBeNull();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Goal ended"), "info");
  });

  it("/focus-goal shows the active definition", async () => {
    await invoke(pi, "focus-goal-start", "npm test passes");
    const ctx = await invoke(pi, "focus-goal");
    expect(ctx.ui.notify).toHaveBeenCalledWith("Active goal: npm test passes", "info");
  });

  it("/focus-goal reports no active goal when none is set", async () => {
    const ctx = await invoke(pi, "focus-goal");
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("No active goal"), "info");
  });

  it("is session-scoped: session_start clears any goal", async () => {
    await invoke(pi, "focus-goal-start", "a goal");
    await pi._callbacks.session_start[0]({}, createCtx());
    expect(getActiveGoal()).toBeNull();
  });
});

describe("goal-loop /focus-goal-start-submit", () => {
  let pi: any;

  beforeEach(() => {
    _resetGoalLoopForTests();
    pi = createPiMock();
    registerGoalLoop(pi);
  });

  it("arms identically to /focus-goal-start: active goal set, status set, agent informed", async () => {
    const ctx = await invoke(pi, "focus-goal-start-submit", "npm test passes and docs are updated");

    expect(getActiveGoal()).toBe("npm test passes and docs are updated");
    expect(ctx.ui.setStatus).toHaveBeenCalledWith(GOAL_STATUS_KEY, expect.any(String));
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Goal started"), "info");
    expect(pi._messages.at(-1).msg.content).toContain("Goal started by user for this session");
  });

  it("when idle: submits the definition via sendUserMessage without deliverAs", async () => {
    const ctx = createCtx(); // isIdle → true
    await invoke(pi, "focus-goal-start-submit", "finish the migration", ctx);

    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(pi.sendUserMessage).toHaveBeenCalledWith("finish the migration", { expandPromptTemplates: false });
  });

  it("when busy: submits the definition as a followUp", async () => {
    const ctx = createCtx({ isIdle: vi.fn().mockReturnValue(false) });
    await invoke(pi, "focus-goal-start-submit", "finish the migration", ctx);

    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(pi.sendUserMessage).toHaveBeenCalledWith("finish the migration", { deliverAs: "followUp", expandPromptTemplates: false });
  });

  it("rejects an empty definition with usage help BEFORE any submission", async () => {
    const ctx = await invoke(pi, "focus-goal-start-submit", "   ");

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Usage: /focus-goal-start-submit"), "warning");
    expect(getActiveGoal()).toBeNull();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("rejects a definition over 500 characters BEFORE any submission", async () => {
    const definition = "x".repeat(GOAL_MAX_LENGTH + 1);
    const ctx = await invoke(pi, "focus-goal-start-submit", definition);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      `Goal definition is ${definition.length} characters; the maximum is ${GOAL_MAX_LENGTH}. Shorten the goal and retry.`,
      "error",
    );
    expect(getActiveGoal()).toBeNull();
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });

  it("accepts a definition of exactly 500 characters and submits it", async () => {
    const definition = "x".repeat(GOAL_MAX_LENGTH);
    await invoke(pi, "focus-goal-start-submit", definition);

    expect(getActiveGoal()).toBe(definition);
    expect(pi.sendUserMessage).toHaveBeenCalledWith(definition, { expandPromptTemplates: false });
  });

  it("regression: /focus-goal-start (passive) does not submit a user message", async () => {
    await invoke(pi, "focus-goal-start", "finish the migration");

    expect(getActiveGoal()).toBe("finish the migration");
    expect(pi.sendUserMessage).not.toHaveBeenCalled();
  });
});

describe("goal-loop turn-end nudge", () => {
  let pi: any;

  beforeEach(() => {
    _resetGoalLoopForTests();
    pi = createPiMock();
    registerGoalLoop(pi);
  });

  it("nudges with the goal description verbatim at agent_end when a goal is active", async () => {
    await invoke(pi, "focus-goal-start", "npm test passes and the migration is applied");
    pi.sendMessage.mockClear();

    await agentEnd(pi);

    expect(pi.sendMessage).toHaveBeenCalledTimes(1);
    const { msg, opts } = pi._messages.at(-1);
    expect(opts).toEqual({ triggerTurn: true, deliverAs: "steer" });
    expect(msg.content).toContain('"npm test passes and the migration is applied"');
    expect(msg.content).toContain("cross-check");
  });

  it("does not nudge at agent_end when no goal is active", async () => {
    pi.sendMessage.mockClear();

    await agentEnd(pi);

    expect(pi.sendMessage).not.toHaveBeenCalled();
  });

  it("does not nudge at agent_end after the goal was ended", async () => {
    await invoke(pi, "focus-goal-start", "a goal");
    await invoke(pi, "focus-goal-end");
    pi.sendMessage.mockClear();

    await agentEnd(pi);

    expect(pi.sendMessage).not.toHaveBeenCalled();
  });

  it("re-arms after agent_settled: one nudge per settled run, no budget (v1)", async () => {
    await invoke(pi, "focus-goal-start", "a goal");
    pi.sendMessage.mockClear();

    // 1. First turn ends: nudge fires.
    await agentEnd(pi);
    expect(pi.sendMessage).toHaveBeenCalledTimes(1);

    // 2. The injected steer turn ends before the run settles: the latch holds,
    //    so no second nudge (count stays 1).
    await agentEnd(pi);
    expect(pi.sendMessage).toHaveBeenCalledTimes(1);

    // 3. The run settles: the latch clears.
    await goalAgentSettled(pi);

    // 4. The next turn end nudges again — v1 has no budget/loop cap.
    await agentEnd(pi);
    expect(pi.sendMessage).toHaveBeenCalledTimes(2);

    // Both nudges carry the goal's own description verbatim (anti-magic).
    const nudges = pi._messages.filter((m: any) => m.msg.content.includes("[goal-reminder]"));
    expect(nudges).toHaveLength(2);
    for (const nudge of nudges) {
      expect(nudge.msg.content).toContain('"a goal"');
      expect(nudge.msg.content).toContain("cross-check");
      expect(nudge.opts).toEqual({ triggerTurn: true, deliverAs: "steer" });
    }
  });

  it("clears the latch on agent_settled even after the nudge", async () => {
    await invoke(pi, "focus-goal-start", "a goal");

    await agentEnd(pi);
    expect(pi.sendMessage).toHaveBeenCalledTimes(2);
    await goalAgentSettled(pi);
    expect(getActiveGoal()).toBe("a goal");
  });

  it("updates the footer status only when a goal is active", async () => {
    const ctxOff = createCtx();
    await pi._callbacks.session_start[0]({}, ctxOff);
    expect(ctxOff.ui.setStatus).toHaveBeenCalledWith(GOAL_STATUS_KEY, undefined);

    const ctxOn = await invoke(pi, "focus-goal-start", "a goal");
    expect(ctxOn.ui.setStatus).toHaveBeenCalledWith(GOAL_STATUS_KEY, "⭕");
  });
});

describe("goal-loop /focus-goal-suggest", () => {
  let pi: any;

  beforeEach(() => {
    _resetGoalLoopForTests();
    pi = createPiMock();
    registerGoalLoop(pi);
  });

  it("when idle: emits the settled prompt via sendUserMessage without deliverAs", async () => {
    const ctx = createCtx(); // isIdle → true
    await invoke(pi, "focus-goal-suggest", "", ctx);

    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(pi.sendUserMessage).toHaveBeenCalledWith(GOAL_SUGGEST_PROMPT, { expandPromptTemplates: false });
  });

  it("when busy: queues the prompt as a followUp", async () => {
    const ctx = createCtx({ isIdle: vi.fn().mockReturnValue(false) });
    await invoke(pi, "focus-goal-suggest", "", ctx);

    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(pi.sendUserMessage).toHaveBeenCalledWith(GOAL_SUGGEST_PROMPT, { deliverAs: "followUp", expandPromptTemplates: false });
  });

  it("ignores any arguments: the prompt is identical regardless of input", async () => {
    await invoke(pi, "focus-goal-suggest", "arbitrary junk arguments");

    expect(pi.sendUserMessage).toHaveBeenCalledTimes(1);
    expect(pi.sendUserMessage).toHaveBeenCalledWith(GOAL_SUGGEST_PROMPT, { expandPromptTemplates: false });
  });

  it("prompt content pins the settled contract: user stop-triggers, repo-agnostic standard, 500-char limit", () => {
    expect(GOAL_SUGGEST_PROMPT).toContain("need me (the user) for requirements or goal-setting");
    expect(GOAL_SUGGEST_PROMPT).toContain("SEVERELY blocked");
    expect(GOAL_SUGGEST_PROMPT).toContain("this repo's documentation standard");
    expect(GOAL_SUGGEST_PROMPT).toContain("500 characters");
    expect(GOAL_SUGGEST_PROMPT).toContain("/focus-goal-start");
    // Repo-agnostic on purpose: no hard-coded docs/feature-impl path in the emitted prompt.
    expect(GOAL_SUGGEST_PROMPT).not.toContain("docs/feature-impl");
  });

  it("suggest-only: no goal state, no cross-check arming, no custom-type message", async () => {
    const ctx = await invoke(pi, "focus-goal-suggest");

    expect(getActiveGoal()).toBeNull();
    expect(pi.sendMessage).not.toHaveBeenCalled();
    expect(ctx.ui.setStatus).not.toHaveBeenCalled();

    // With nothing armed, agent_end must not nudge.
    pi.sendMessage.mockClear();
    await agentEnd(pi);
    expect(pi.sendMessage).not.toHaveBeenCalled();
  });
});
