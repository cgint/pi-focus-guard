import { beforeEach, describe, expect, it, vi } from "vitest";
import focusGuard, { COMMIT_GUARD_STATUS_KEY, formatCommitGuardBlockedReason } from "../src/focus-guard.js";

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
    expect(result.reason).toContain("DENIED");
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
    expect(result.reason).toContain("The bash command writes to");
  });

  it("persists write guard allowlist and updates status", async () => {
    expect(pi.appendEntry).toHaveBeenCalledWith("write-guard", { mode: "allow", dirs: ["docs"] });
    const ctx = await invoke(pi, "focus-write-guard", "docs", createCtx({ cwd: "/project" }));
    expect(ctx.ui.setStatus).toHaveBeenCalledWith("a2_write_guard", expect.any(String));
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
    expect(result.reason).toContain("discuss mode");
  });

  it("allows read tool calls in read mode", async () => {
    await invoke(pi, "focus-discuss-read", "", createCtx());
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "read", input: { path: "README.md" } },
      createCtx(),
    );

    expect(result).toBeUndefined();
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

  it("blocks write-like bash in read mode", async () => {
    await invoke(pi, "focus-discuss-read", "", createCtx());
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "bash", input: { command: "touch file.txt" } },
      createCtx(),
    );

    expect(result).toEqual(expect.objectContaining({ block: true }));
    expect(result.reason).toContain("discuss mode");
  });

  it("persists discuss mode and updates status", async () => {
    const ctx = await invoke(pi, "focus-discuss-read", "", createCtx());
    expect(pi.appendEntry).toHaveBeenCalledWith("discuss-mode", { mode: "read", explicit: true });
    expect(ctx.ui.setStatus).toHaveBeenCalledWith("a1_discuss", "📖");
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
    expect(result.reason).toContain("review git diff");
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
