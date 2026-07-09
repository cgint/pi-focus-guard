import { describe, it, expect } from "vitest";
import { getEffectivePolicy, type EffectivePolicy } from "../src/discuss/config.js";
import {
  formatDiscussBlockedToolReason as formatBlockedToolReason,
  isToolAllowedByDiscussPolicy as isToolAllowedByPolicy,
  READ_MODE_ALLOWED_TOOLS,
  READ_MODE_ALLOWED_DISPLAY,
} from "../src/focus-guard.js";
import { isBashCommandReadOnly } from "../src/discuss/is-readonly.js";

describe("discuss getEffectivePolicy", () => {
  it("returns enforce:false for off mode", () => {
    const result = getEffectivePolicy({ mode: "off", explicit: true });
    expect(result).toEqual({ enforce: false, mode: "off" });
  });

  it("returns enforce:true for block mode", () => {
    const result = getEffectivePolicy({ mode: "block", explicit: true });
    expect(result).toEqual({ enforce: true, mode: "block" });
  });

  it("returns enforce:true for read mode", () => {
    const result = getEffectivePolicy({ mode: "read", explicit: true });
    expect(result).toEqual({ enforce: true, mode: "read" });
  });

  it("ignores explicit flag — off is always off", () => {
    const result = getEffectivePolicy({ mode: "off", explicit: false });
    expect(result).toEqual({ enforce: false, mode: "off" });
  });

  it("ignores explicit flag — block is always block", () => {
    const result = getEffectivePolicy({ mode: "block", explicit: false });
    expect(result).toEqual({ enforce: true, mode: "block" });
  });

  it("ignores explicit flag — read is always read", () => {
    const result = getEffectivePolicy({ mode: "read", explicit: false });
    expect(result).toEqual({ enforce: true, mode: "read" });
  });
});

describe("discuss isToolAllowedByPolicy", () => {
  const EXPECTED_READ_MODE_ALLOWED = new Set([
    "read",
    "ls",
    "find",
    "grep",
    "advisor",
    "web_search",
    "fetch_content",
    "get_search_content",
  ]);

  it("READ_MODE_ALLOWED_TOOLS matches the expected canonical set", () => {
    expect(READ_MODE_ALLOWED_TOOLS.size).toBe(EXPECTED_READ_MODE_ALLOWED.size);
    for (const tool of EXPECTED_READ_MODE_ALLOWED) {
      expect(READ_MODE_ALLOWED_TOOLS.has(tool)).toBe(true);
    }
  });

  it("allows all tools when policy is off", () => {
    expect(isToolAllowedByPolicy("bash", { enforce: false, mode: "off" })).toBe(true);
    expect(isToolAllowedByPolicy("write", { enforce: false, mode: "off" })).toBe(true);
    expect(isToolAllowedByPolicy("edit", { enforce: false, mode: "off" })).toBe(true);
  });

  it("blocks all tools in block mode", () => {
    expect(isToolAllowedByPolicy("read", { enforce: true, mode: "block" })).toBe(false);
    expect(isToolAllowedByPolicy("bash", { enforce: true, mode: "block" })).toBe(false);
    expect(isToolAllowedByPolicy("edit", { enforce: true, mode: "block" })).toBe(false);
    expect(isToolAllowedByPolicy("write", { enforce: true, mode: "block" })).toBe(false);
  });

  it("allows ls, find, grep built-in tools in read mode", () => {
    const readMode: EffectivePolicy = { enforce: true, mode: "read" };
    expect(isToolAllowedByPolicy("ls", readMode)).toBe(true);
    expect(isToolAllowedByPolicy("find", readMode)).toBe(true);
    expect(isToolAllowedByPolicy("grep", readMode)).toBe(true);
  });

  it("allows only the expected read-mode tools and blocks write-capable ones", () => {
    const readMode: EffectivePolicy = { enforce: true, mode: "read" };
    for (const tool of EXPECTED_READ_MODE_ALLOWED) {
      expect(isToolAllowedByPolicy(tool, readMode)).toBe(true);
    }
    expect(isToolAllowedByPolicy("bash", readMode)).toBe(false);
    expect(isToolAllowedByPolicy("edit", readMode)).toBe(false);
    expect(isToolAllowedByPolicy("write", readMode)).toBe(false);
  });
});

describe("discuss READ_MODE_ALLOWED_DISPLAY", () => {
  it("includes bash(read-only) for the special-cased bash handler", () => {
    expect(READ_MODE_ALLOWED_DISPLAY).toContain("bash(read-only)");
  });

  it("includes all tools from READ_MODE_ALLOWED_TOOLS", () => {
    for (const tool of READ_MODE_ALLOWED_TOOLS) {
      expect(READ_MODE_ALLOWED_DISPLAY).toContain(tool);
    }
  });
});

describe("discuss formatBlockedToolReason", () => {
  it("includes HARD BLOCK prefix", () => {
    const reason = formatBlockedToolReason("bash", { enforce: true, mode: "read" });
    expect(reason).toContain("[TOOL CALL DENIED — HARD BLOCK]");
  });

  it("contains the discuss-mode explanation", () => {
    const reason = formatBlockedToolReason("bash", { enforce: true, mode: "read" });
    expect(reason).toContain("discuss mode");
    expect(reason).toContain("think, analyze, and discuss");
    expect(reason).toContain("not take action");
  });

  it("contains the user-action hint", () => {
    const reason = formatBlockedToolReason("bash", { enforce: true, mode: "read" });
    expect(reason).toContain("describe what you'd like to do");
    expect(reason).toContain("switch out of discuss mode");
  });

  it("returns empty string when policy is off", () => {
    const reason = formatBlockedToolReason("bash", { enforce: false, mode: "off" });
    expect(reason).toBe("");
  });
});

describe("discuss cli flag does not lock session commands", () => {
  it("source code must not contain CLI flag guard in command handlers", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/focus-guard.ts", "utf-8");
    expect(src).not.toContain("Cannot change discuss mode while a CLI flag is set");
    expect(src).not.toMatch(/hasCliFlag.*getFlag.*dm-/);
  });

  it("command description reflects initial-state-only semantics", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync("src/focus-guard.ts", "utf-8");
    expect(src).not.toContain("CLI flag overrides");
  });
});

describe("discuss bash read-only detection", () => {
  it("allows read-only bash commands", () => {
    expect(isBashCommandReadOnly("ls -la")).toBe(true);
    expect(isBashCommandReadOnly("grep pattern file.txt")).toBe(true);
    expect(isBashCommandReadOnly("cat file.txt")).toBe(true);
    expect(isBashCommandReadOnly("find . -name '*.ts'")).toBe(true);
    expect(isBashCommandReadOnly("ls | grep txt")).toBe(true);
  });

  it("blocks bash commands with write surface", () => {
    expect(isBashCommandReadOnly("touch file.txt")).toBe(false);
    expect(isBashCommandReadOnly("rm file.txt")).toBe(false);
    expect(isBashCommandReadOnly("echo hello > out.txt")).toBe(false);
    expect(isBashCommandReadOnly("ls | tee output.txt")).toBe(false);
  });
});
