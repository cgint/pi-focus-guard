import { beforeEach, describe, expect, it, vi } from "vitest";
import focusGuard, {
  COMMIT_GUARD_STATUS_KEY,
  formatCommitGuardBlockedReason,
} from "../src/focus-guard.js";

function createPiMock() {
  const commands = new Map<string, { description: string; handler: (args: string, ctx: any) => Promise<void> }>();
  const callbacks: Record<string, Function[]> = {};
  const flags: Record<string, unknown> = {};
  const entries: Array<{ type: string; data: unknown }> = [];
  const messages: Array<{ msg: any; opts: any }> = [];

  return {
    registerFlag: vi.fn((name: string) => {
      flags[name] = flags[name];
    }),
    registerCommand: vi.fn((name: string, options: { description: string; handler: (args: string, ctx: any) => Promise<void> }) => {
      commands.set(name, options);
    }),
    getFlag: vi.fn((name: string) => flags[name]),
    appendEntry: vi.fn((type: string, data: unknown) => entries.push({ type, data })),
    sendMessage: vi.fn((msg: any, opts: any) => {
      messages.push({ msg, opts });
      return Promise.resolve();
    }),
    on: vi.fn((event: string, handler: Function) => {
      callbacks[event] ??= [];
      callbacks[event].push(handler);
    }),
    _commands: commands,
    _callbacks: callbacks,
    _entries: entries,
    _messages: messages,
    _setFlag(name: string, value: unknown) {
      flags[name] = value;
    },
  } as any;
}

function createCtx(overrides: Partial<any> = {}) {
  return {
    hasUI: true,
    cwd: "/project",
    ui: {
      notify: vi.fn(),
      setStatus: vi.fn(),
    },
    sessionManager: {
      getEntries: vi.fn().mockReturnValue([]),
    },
    shutdown: vi.fn(),
    ...overrides,
  };
}

async function invoke(pi: any, name: string, args = "", ctx = createCtx()) {
  const command = pi._commands.get(name);
  if (!command) throw new Error(`Command not registered: ${name}`);
  await command.handler(args, ctx);
  return ctx;
}

describe("focus command surface", () => {
  let pi: any;

  beforeEach(() => {
    pi = createPiMock();
    focusGuard(pi);
  });

  it("registers only focus-prefixed user commands", () => {
    expect([...pi._commands.keys()].sort()).toEqual([
      "focus-commit-guard",
      "focus-commit-guard-off",
      "focus-commit-guard-on",
      "focus-discuss",
      "focus-discuss-block",
      "focus-discuss-off",
      "focus-discuss-read",
      "focus-write-guard",
      "focus-write-guard-all",
    ]);
  });

  it("registers legacy flags for parity", () => {
    expect(pi.registerFlag).toHaveBeenCalledWith("write-guard", expect.objectContaining({ type: "string" }));
    expect(pi.registerFlag).toHaveBeenCalledWith("write-guard-all", expect.objectContaining({ type: "boolean" }));
    expect(pi.registerFlag).toHaveBeenCalledWith("write-guard-off", expect.objectContaining({ type: "boolean" }));
    expect(pi.registerFlag).toHaveBeenCalledWith("dm-off", expect.objectContaining({ type: "boolean" }));
    expect(pi.registerFlag).toHaveBeenCalledWith("dm-read", expect.objectContaining({ type: "boolean" }));
    expect(pi.registerFlag).toHaveBeenCalledWith("dm-block", expect.objectContaining({ type: "boolean" }));
    expect(pi.registerFlag).toHaveBeenCalledWith("commit-guard", expect.objectContaining({ type: "boolean" }));
    expect(pi.registerFlag).toHaveBeenCalledWith("commit-guard-on", expect.objectContaining({ type: "boolean" }));
    expect(pi.registerFlag).toHaveBeenCalledWith("commit-guard-off", expect.objectContaining({ type: "boolean" }));
  });
});

describe("startup flags", () => {
  let pi: any;

  beforeEach(() => {
    pi = createPiMock();
    focusGuard(pi);
  });

  async function sessionStart(ctx = createCtx()) {
    await pi._callbacks.session_start[0]({}, ctx);
    return ctx;
  }

  it("reports an invalid empty --write-guard value at startup and shuts down", async () => {
    pi._setFlag("write-guard", "");
    const ctx = await sessionStart();

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Write guard configuration is invalid: --write-guard must name at least one directory. Give at least one directory, or use read-only discuss mode if you intend to forbid all writes.",
      "error",
    );
    expect(ctx.shutdown).toHaveBeenCalledOnce();
  });

  it("shuts down when a persisted allowlist is empty", async () => {
    const ctx = await sessionStart(createCtx({
      sessionManager: {
        getEntries: vi.fn().mockReturnValue([
          { type: "custom", customType: "write-guard", data: { mode: "allow", dirs: [] } },
        ]),
      },
    }));

    expect(ctx.shutdown).toHaveBeenCalledOnce();
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("the session override"), "error");
    expect(pi._messages.some((message: any) => message.msg.content.includes("Allowed under:"))).toBe(false);
  });

  it("clears a previously active policy when a later startup fails", async () => {
    pi._setFlag("write-guard", "docs");
    await sessionStart();
    pi._setFlag("write-guard", "");
    const failedCtx = await sessionStart();

    const result = await pi._callbacks.tool_call[0](
      { toolName: "write", input: { path: "./docs/file.txt", content: "data" } },
      failedCtx,
    );
    expect(failedCtx.shutdown).toHaveBeenCalledOnce();
    expect(result).toEqual(expect.objectContaining({ block: true, reason: expect.stringContaining("not activated") }));
  });

  it("shows the activated policy without rereading a mutated source", async () => {
    pi._setFlag("write-guard", "docs");
    await sessionStart();
    pi._setFlag("write-guard", "");
    const ctx = await invoke(pi, "focus-write-guard", "", createCtx());

    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("source: flag"), "info");
    expect(ctx.ui.notify).not.toHaveBeenCalledWith(expect.stringContaining("invalid"), "error");
    await expect(pi._callbacks.tool_call[0](
      { toolName: "write", input: { path: "/outside/file.txt", content: "data" } },
      ctx,
    )).resolves.toEqual(expect.objectContaining({ block: true }));
  });

  it("uses the policy activated at session start rather than rereading settings on tool calls", async () => {
    await invoke(pi, "focus-write-guard-all", "", createCtx({ hasUI: false }));
    const ctx = await sessionStart();
    pi._setFlag("write-guard", "");

    const result = await pi._callbacks.tool_call[0](
      { toolName: "write", input: { path: "/project/file.txt", content: "data" } },
      ctx,
    );

    expect(result).toBeUndefined();
    expect(ctx.shutdown).not.toHaveBeenCalled();
  });

  it("starts discuss mode off with --dm-off even when a persisted mode exists", async () => {
    pi._setFlag("dm-off", true);
    const ctx = await sessionStart(createCtx({
      sessionManager: {
        getEntries: vi.fn().mockReturnValue([
          { type: "custom", customType: "discuss-mode", data: { mode: "block", explicit: true } },
        ]),
      },
    }));

    expect(ctx.ui.setStatus).toHaveBeenCalledWith("a1_discuss", "✅");
  });

  it("starts write guard off with --write-guard-off even when a persisted allowlist exists", async () => {
    pi._setFlag("write-guard-off", true);
    await sessionStart(createCtx({
      sessionManager: {
        getEntries: vi.fn().mockReturnValue([
          { type: "custom", customType: "write-guard", data: { mode: "allow", dirs: ["docs"] } },
        ]),
      },
    }));
    const result = await pi._callbacks.tool_call[0](
      { toolName: "write", input: { path: "/outside/file.txt", content: "data" } },
      createCtx(),
    );

    expect(result).toBeUndefined();
  });

  it("starts commit guard on with --commit-guard", async () => {
    pi._setFlag("commit-guard", true);
    await sessionStart();
    const result = await pi._callbacks.tool_call[0](
      { toolName: "bash", input: { command: "git commit -m test" } },
      createCtx(),
    );

    expect(result).toEqual({ block: true, reason: formatCommitGuardBlockedReason() });
  });

  it("starts commit guard off with --commit-guard-off even when persisted enabled", async () => {
    pi._setFlag("commit-guard-off", true);
    await sessionStart(createCtx({
      sessionManager: {
        getEntries: vi.fn().mockReturnValue([
          { type: "custom", customType: "focus-commit-guard", data: { enabled: true } },
        ]),
      },
    }));
    const result = await pi._callbacks.tool_call[0](
      { toolName: "bash", input: { command: "git commit -m test" } },
      createCtx(),
    );

    expect(result).toBeUndefined();
  });
});

describe("write guard parity", () => {
  let pi: any;

  beforeEach(async () => {
    pi = createPiMock();
    focusGuard(pi);
    await invoke(pi, "focus-discuss-off", "", createCtx({ hasUI: false }));
    await invoke(pi, "focus-commit-guard-off", "", createCtx({ hasUI: false }));
    await invoke(pi, "focus-write-guard", "docs", createCtx({ cwd: "/project" }));
  });

  it("blocks write tool targets outside the allowlist", async () => {
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "write", input: { path: "/outside/file.txt", content: "data" } },
      createCtx({ cwd: "/project" }),
    );

    expect(result).toEqual(expect.objectContaining({ block: true }));
    expect(result.reason).toContain("[WRITE DENIED — OUTSIDE APPROVED SCOPE]");
    expect(result.reason).toContain("Blocked action");
    expect(result.reason).toContain("Why guarded");
    expect(result.reason).toContain("Next step");
    expect(result.reason).toContain("outside the allowed directories");
  });

  it("allows write tool targets inside the allowlist", async () => {
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "write", input: { path: "./docs/file.txt", content: "data" } },
      createCtx({ cwd: "/project" }),
    );

    expect(result).toBeUndefined();
  });

  it("blocks edit tool targets outside the allowlist", async () => {
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "edit", input: { path: "/outside/file.txt", edits: [] } },
      createCtx({ cwd: "/project" }),
    );

    expect(result).toEqual(expect.objectContaining({ block: true }));
    expect(result.reason).toContain("outside the allowed directories");
  });

  it("blocks bash write targets outside the allowlist", async () => {
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "bash", input: { command: "echo hello > /outside/out.txt" } },
      createCtx({ cwd: "/project" }),
    );

    expect(result).toEqual(expect.objectContaining({ block: true }));
    expect(result.reason).toContain("[WRITE DENIED — OUTSIDE APPROVED SCOPE]");
    expect(result.reason).toContain("The bash command writes to");
  });

  it("persists write guard allowlist and updates status", async () => {
    expect(pi.appendEntry).toHaveBeenCalledWith("write-guard", { mode: "allow", dirs: ["docs"] });
    const ctx = await invoke(pi, "focus-write-guard", "docs", createCtx({ cwd: "/project" }));
    expect(ctx.ui.setStatus).toHaveBeenCalledWith("a2_write_guard", expect.any(String));
  });

  it("rejects an empty command allowlist without changing the existing policy", async () => {
    const ctx = await invoke(pi, "focus-write-guard", ",", createCtx({ cwd: "/project" }));

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      "Write guard configuration is invalid: /focus-write-guard must name at least one directory. Give at least one directory, or use read-only discuss mode if you intend to forbid all writes.",
      "error",
    );
    const result = await pi._callbacks.tool_call[0](
      { toolName: "write", input: { path: "./docs/file.txt", content: "data" } },
      createCtx({ cwd: "/project" }),
    );
    expect(result).toBeUndefined();
  });
});

describe("discuss mode parity", () => {
  let pi: any;

  beforeEach(async () => {
    pi = createPiMock();
    focusGuard(pi);
    await invoke(pi, "focus-write-guard-all", "", createCtx({ hasUI: false }));
    await invoke(pi, "focus-commit-guard-off", "", createCtx({ hasUI: false }));
    await invoke(pi, "focus-discuss-off", "", createCtx({ hasUI: false }));
  });

  it("blocks all tool calls in block mode", async () => {
    await invoke(pi, "focus-discuss-block", "", createCtx());
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "read", input: { path: "README.md" } },
      createCtx(),
    );

    expect(result).toEqual(expect.objectContaining({ block: true }));
    expect(result.reason).toContain("[TOOL CALL DENIED — DISCUSS BLOCK MODE]");
    expect(result.reason).toContain("No tool calls may run.");
  });

  it("allows read, session-local, and extension tool calls in read mode", async () => {
    await invoke(pi, "focus-discuss-read", "", createCtx());
    const toolCall = pi._callbacks.tool_call[0];

    for (const toolName of ["read", "workpad", "arbitrary-extension-tool"]) {
      const result = await toolCall(
        { toolName, input: { path: "README.md" } },
        createCtx(),
      );

      expect(result).toBeUndefined();
    }
  });

  it("allows read-only bash in read mode", async () => {
    await invoke(pi, "focus-discuss-read", "", createCtx());
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "bash", input: { command: "ls -la" } },
      createCtx(),
    );

    expect(result).toBeUndefined();
  });

  it("blocks write and edit tool calls in read mode", async () => {
    await invoke(pi, "focus-discuss-read", "", createCtx());
    const toolCall = pi._callbacks.tool_call[0];

    for (const toolName of ["write", "edit"]) {
      const result = await toolCall(
        { toolName, input: { path: "README.md" } },
        createCtx(),
      );

      expect(result).toEqual(expect.objectContaining({ block: true }));
      expect(result.reason).toContain("[TOOL CALL DENIED — DISCUSS READ-ONLY MODE]");
    }
  });

  it("blocks write-like bash in read mode", async () => {
    await invoke(pi, "focus-discuss-read", "", createCtx());
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "bash", input: { command: "touch file.txt" } },
      createCtx(),
    );

    expect(result).toEqual(expect.objectContaining({ block: true }));
    expect(result.reason).toContain("[TOOL CALL DENIED — DISCUSS READ-ONLY MODE]");
    expect(result.reason).toContain("Write and edit calls are blocked.");
    expect(result.reason).toContain("Bash commands must be classified as read-only.");
    expect(result.reason).toContain("All other tool calls may run.");
  });

  it("persists discuss mode, updates status, and states the strict read contract", async () => {
    const ctx = await invoke(pi, "focus-discuss-read", "", createCtx());
    expect(pi.appendEntry).toHaveBeenCalledWith("discuss-mode", { mode: "read", explicit: true });
    expect(ctx.ui.setStatus).toHaveBeenCalledWith("a1_discuss", "📖");
    expect(pi._messages.at(-1).msg.content).toContain("Write and edit calls are blocked.");
    expect(pi._messages.at(-1).msg.content).toContain("Bash is permitted only when the guard classifies it as read-only.");
    expect(pi._messages.at(-1).msg.content).not.toContain("scratch");
  });

  it("changes mode before processing a transformed inline request", async () => {
    const ctx = createCtx();
    const result = await pi._callbacks.input[0]({
      type: "input",
      text: "-dr: inspect the repository",
      source: "interactive",
    }, ctx);

    expect(result).toEqual({ action: "transform", text: "inspect the repository", images: undefined });
    expect(ctx.ui.setStatus).toHaveBeenCalledWith("a1_discuss", "📖");
    expect(pi.appendEntry).toHaveBeenCalledWith("discuss-mode", { mode: "read", explicit: true });
    expect(pi._messages.at(-1)).toEqual(expect.objectContaining({
      msg: expect.objectContaining({
        customType: "discuss-mode",
        content: expect.stringContaining("Strict-Discuss mode started by user in READ-ONLY-mode."),
        display: true,
      }),
      opts: { triggerTurn: false },
    }));

    const toolResult = await pi._callbacks.tool_call[0](
      { toolName: "write", input: { path: "/project/file.txt", content: "data" } },
      ctx,
    );
    expect(toolResult).toEqual(expect.objectContaining({ block: true }));
  });

  it("defers a queued inline transition until its user message starts", async () => {
    const ctx = createCtx();
    const result = await pi._callbacks.input[0]({
      type: "input",
      text: "-dr: hello",
      source: "interactive",
      streamingBehavior: "followUp",
    }, ctx);

    expect(result).toEqual({ action: "transform", text: "hello", images: undefined });
    expect(ctx.ui.setStatus).not.toHaveBeenCalledWith("a1_discuss", "📖");
    expect(await pi._callbacks.tool_call[0]({ toolName: "write", input: { path: "/project/file.txt", content: "data" } }, ctx)).toBeUndefined();

    await pi._callbacks.message_start[0]({ type: "message_start", message: { role: "user", content: "hello" } }, ctx);

    expect(ctx.ui.setStatus).toHaveBeenCalledWith("a1_discuss", "📖");
    expect(await pi._callbacks.tool_call[0]({ toolName: "write", input: { path: "/project/file.txt", content: "data" } }, ctx)).toEqual(expect.objectContaining({ block: true }));
    expect(pi._messages.at(-1)).toEqual(expect.objectContaining({
      msg: expect.objectContaining({ customType: "discuss-mode", content: expect.stringContaining("Strict-Discuss mode started by user in READ-ONLY-mode.") }),
      opts: expect.objectContaining({ deliverAs: "steer" }),
    }));
  });

  it("activates a steer directive immediately", async () => {
    const ctx = createCtx();
    await pi._callbacks.input[0]({
      type: "input",
      text: "-dr: steer now",
      source: "interactive",
      streamingBehavior: "steer",
    }, ctx);

    expect(ctx.ui.setStatus).toHaveBeenCalledWith("a1_discuss", "📖");
    expect(pi._messages.at(-1)).toEqual(expect.objectContaining({
      msg: expect.objectContaining({ customType: "discuss-mode" }),
      opts: { triggerTurn: false },
    }));
  });

  it("keeps deferred transitions aligned with every queued follow-up", async () => {
    const ctx = createCtx();
    await pi._callbacks.input[0]({ type: "input", text: "plain follow-up", source: "interactive", streamingBehavior: "followUp" }, ctx);
    await pi._callbacks.input[0]({ type: "input", text: "-dr: read follow-up", source: "interactive", streamingBehavior: "followUp" }, ctx);

    await pi._callbacks.message_start[0]({ type: "message_start", message: { role: "user", content: "plain follow-up" } }, ctx);
    expect(ctx.ui.setStatus).not.toHaveBeenCalledWith("a1_discuss", "📖");
    await pi._callbacks.message_start[0]({ type: "message_start", message: { role: "user", content: "read follow-up" } }, ctx);
    expect(ctx.ui.setStatus).toHaveBeenCalledWith("a1_discuss", "📖");
  });

  it("clears deferred transitions when the agent settles", async () => {
    const ctx = createCtx();
    await pi._callbacks.input[0]({ type: "input", text: "-dr: discarded", source: "interactive", streamingBehavior: "followUp" }, ctx);
    await pi._callbacks.agent_settled[0]({}, ctx);

    await pi._callbacks.message_start[0]({ type: "message_start", message: { role: "user", content: "later prompt" } }, ctx);
    expect(ctx.ui.setStatus).not.toHaveBeenCalledWith("a1_discuss", "📖");
  });

  it("handles a directive-only request without starting an agent turn", async () => {
    const result = await pi._callbacks.input[0]({
      type: "input",
      text: "-db:",
      source: "rpc",
    }, createCtx());

    expect(result).toEqual({ action: "handled" });
    await expect(pi._callbacks.tool_call[0]({ toolName: "read", input: { path: "README.md" } }, createCtx())).resolves.toEqual(
      expect.objectContaining({ block: true }),
    );
  });

  it("keeps inline -do: as a non-persisted session override", async () => {
    const result = await pi._callbacks.input[0]({
      type: "input",
      text: "-do: implement the change",
      source: "interactive",
    }, createCtx());

    expect(result).toEqual({ action: "transform", text: "implement the change", images: undefined });
    expect(pi.appendEntry).not.toHaveBeenCalledWith("discuss-mode", { mode: "off", explicit: true });
  });

  it("does not parse extension-generated messages", async () => {
    const result = await pi._callbacks.input[0]({
      type: "input",
      text: "-dr: injected status",
      source: "extension",
    }, createCtx());

    expect(result).toEqual({ action: "continue" });
    const toolResult = await pi._callbacks.tool_call[0](
      { toolName: "write", input: { path: "/project/file.txt", content: "data" } },
      createCtx(),
    );
    expect(toolResult).toBeUndefined();
  });
});

describe("commit guard", () => {
  let pi: any;

  beforeEach(async () => {
    pi = createPiMock();
    focusGuard(pi);
    await invoke(pi, "focus-discuss-off", "", createCtx({ hasUI: false }));
    await invoke(pi, "focus-write-guard-all", "", createCtx({ hasUI: false }));
    await invoke(pi, "focus-commit-guard-off", "", createCtx({ hasUI: false }));
  });

  it("reports status through /focus-commit-guard", async () => {
    const ctx = await invoke(pi, "focus-commit-guard");
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Commit guard is OFF"), "info");
  });

  it("enables via /focus-commit-guard-on and updates footer status", async () => {
    const ctx = await invoke(pi, "focus-commit-guard-on");
    expect(pi.appendEntry).toHaveBeenCalledWith("focus-commit-guard", { enabled: true });
    expect(ctx.ui.setStatus).toHaveBeenCalledWith(COMMIT_GUARD_STATUS_KEY, expect.any(String));
    expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Commit guard enabled"), "info");
  });

  it("blocks bash commands containing git commit when enabled", async () => {
    await invoke(pi, "focus-commit-guard-on");
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "bash", input: { command: "git commit -m test" } },
      createCtx(),
    );

    expect(result).toEqual({ block: true, reason: formatCommitGuardBlockedReason() });
    expect(result.reason).toContain("Blocked action");
    expect(result.reason).toContain("Why guarded");
    expect(result.reason).toContain("Next step");
    expect(result.reason).toContain("review `git diff` together");
  });

  it("allows bash commands containing git commit when disabled", async () => {
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "bash", input: { command: "git commit -m test" } },
      createCtx(),
    );

    expect(result).toBeUndefined();
  });

  it("allows non-commit bash commands when enabled", async () => {
    await invoke(pi, "focus-commit-guard-on");
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "bash", input: { command: "git status --short" } },
      createCtx(),
    );

    expect(result).toBeUndefined();
  });
});
