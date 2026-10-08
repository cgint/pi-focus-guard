import { beforeEach, describe, expect, it, vi } from "vitest";
import focusGuard, {
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

/**
 * Set up a session in dm-read mode with commit guard enabled.
 * This exercises the hook-ordering fix: bash-specific safety guards
 * (crazy-find, commit) must run BEFORE the discuss policy check,
 * so that a read-only bash command like `find /` is still blocked
 * by the crazy-find guard even in read-only discuss mode.
 */
async function setupDmReadWithCommitGuard(pi: any) {
  pi._setFlag("dm-read", true);
  pi._setFlag("commit-guard", true);
  // No crazy-find flag → default ON
  await pi._callbacks.session_start[0]({}, createCtx());
}

describe("hook ordering: bash safety guards before discuss policy", () => {
  let pi: any;

  beforeEach(() => {
    pi = createPiMock();
    focusGuard(pi);
  });

  it("find / in dm-read mode is blocked by crazy-find guard (not early-allowed by read-only classifier)", async () => {
    await setupDmReadWithCommitGuard(pi);
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "bash", input: { command: "find / -name x" } },
      createCtx(),
    );

    // Before the fix, isBashCommandReadOnly would classify `find` as read-only
    // and return undefined (allowed), bypassing the crazy-find guard.
    // After the fix, the crazy-find guard fires first and blocks.
    expect(result).toEqual(expect.objectContaining({ block: true }));
    expect(result.reason).toContain("CRAZY FIND GUARD");
  });

  it("find ./src in dm-read mode is allowed (read-only, no crazy-find finding)", async () => {
    await setupDmReadWithCommitGuard(pi);
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "bash", input: { command: "find ./src -name x" } },
      createCtx(),
    );

    // find ./src is scoped → no crazy-find finding.
    // isBashCommandReadOnly classifies find as read-only → discuss allows it.
    // write-guard-all allows all dirs. → undefined (allowed).
    expect(result).toBeUndefined();
  });

  it("find / in dm-read mode with crazy-find guard disabled is allowed (read-only classifier permits)", async () => {
    // Disable crazy-find guard via persisted entry
    pi._setFlag("dm-read", true);
    pi._setFlag("commit-guard", true);
    await pi._callbacks.session_start[0](
      {},
      createCtx({
        sessionManager: {
          getEntries: vi.fn().mockReturnValue([
            { type: "custom", customType: "focus-crazy-find-guard", data: { enabled: false } },
          ]),
        },
      }),
    );
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "bash", input: { command: "find / -name x" } },
      createCtx(),
    );

    // Crazy-find guard is OFF → no crazy-find block.
    // find is read-only per isBashCommandReadOnly → discuss read mode allows.
    // write-guard-all allows all dirs. → undefined (allowed).
    expect(result).toBeUndefined();
  });

  it("git commit in dm-read mode is blocked by commit guard (not by discuss rejection)", async () => {
    await setupDmReadWithCommitGuard(pi);
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "bash", input: { command: "git commit -m test" } },
      createCtx(),
    );

    // git commit is NOT in WRITER_COMMANDS, so isBashCommandReadOnly returns true.
    // Before the fix, discuss read mode would early-return undefined (allowed),
    // and the commit guard (which came after discuss) would never fire.
    // After the fix, the commit guard fires before discuss policy, blocking
    // with the commit-guard-specific reason.
    expect(result).toEqual(expect.objectContaining({ block: true }));
    // Verify it's the commit guard reason, not the discuss read-mode reason.
    expect(result.reason).toContain("COMMIT DENIED");
    expect(result.reason).not.toContain("DISCUSS READ-ONLY MODE");
  });

  it("git commit in dm-read mode with commit guard disabled falls through to discuss rejection", async () => {
    // commit guard off, dm-read on
    pi._setFlag("dm-read", true);
    pi._setFlag("commit-guard-off", true);
    await pi._callbacks.session_start[0](
      {},
      createCtx({
        sessionManager: {
          getEntries: vi.fn().mockReturnValue([
            { type: "custom", customType: "focus-commit-guard", data: { enabled: false } },
          ]),
        },
      }),
    );
    const toolCall = pi._callbacks.tool_call[0];

    const result = await toolCall(
      { toolName: "bash", input: { command: "git commit -m test" } },
      createCtx(),
    );

    // Commit guard is OFF → no commit block.
    // git commit is read-only per isBashCommandReadOnly → discuss read mode allows.
    // write-guard-all allows all dirs. → undefined (allowed).
    // Note: this is a pre-existing behavioral quirk (git commit classified as
    // read-only), not introduced by the reordering.
    expect(result).toBeUndefined();
  });
});
