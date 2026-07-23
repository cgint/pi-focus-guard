import { describe, expect, it } from "vitest";
import { parseDiscussInputDirective } from "../src/discuss/input-directive.js";

describe("discuss input directives", () => {
  it.each([
    ["-do: implement the change", { mode: "off", text: "implement the change" }],
    ["  -db: explain the architecture", { mode: "block", text: "explain the architecture" }],
    ["-dr: investigate the issue", { mode: "read", text: "investigate the issue" }],
  ] as const)("parses a %s prefix", (input, expected) => {
    expect(parseDiscussInputDirective(input)).toEqual(expected);
  });

  it.each([
    ["Please investigate.\n-dr:", { mode: "read", text: "Please investigate." }],
    ["Explain the design.\n  -db:  ", { mode: "block", text: "Explain the design." }],
    ["Implement it.\n-do:", { mode: "off", text: "Implement it." }],
  ] as const)("parses a %s trailing directive", (input, expected) => {
    expect(parseDiscussInputDirective(input)).toEqual(expected);
  });

  it("returns an empty message for a directive-only input", () => {
    expect(parseDiscussInputDirective("-dr:")).toEqual({ mode: "read", text: "" });
  });

  it.each([
    "-dr: investigate\n-do:",
    "investigate\n-dr:\n-do:",
  ])("rejects multiple directives without changing the message", (input) => {
    expect(parseDiscussInputDirective(input)).toEqual({ multiple: true, text: input });
  });

  it("ignores ordinary text and inline mentions", () => {
    const input = "Please explain -dr: without changing mode.";
    expect(parseDiscussInputDirective(input)).toEqual({ text: input });
  });
});
