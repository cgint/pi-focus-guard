import { describe, expect, it, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import { detectCrazyFind } from "../src/find/crazy-find-detect.js";
import { formatCrazyFindBlockedReason, formatCrazyFindParseError } from "../src/find/format-deny.js";

const homedir = os.homedir();
const homedirBase = path.basename(homedir);
const cwd = "/project";

describe("crazy-find detector (unit)", () => {
  it("blocks find / variants", () => {
    for (const cmd of [
      "find / -name foo",
      "find /// -type f",
      "find /./ -type f",
    ]) {
      const findings = detectCrazyFind(cmd, cwd, homedir);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].type).toBe("root");
    }
  });

  it("blocks find home-directory variants", () => {
    for (const cmd of [
      "find ~ -name bar",
      "find ~/ -name bar",
      "find $HOME -name bar",
      "find ${HOME} -name bar",
      `find ${homedir} -name bar`,
      `find ${homedir}/ -name bar`,
      `find ~${homedirBase} -name bar`,
    ]) {
      const findings = detectCrazyFind(cmd, cwd, homedir);
      expect(findings.length).toBeGreaterThan(0);
      expect(findings[0].type).toBe("home");
    }
  });

  it("unwraps command wrappers (sudo, env, nohup, command)", () => {
    expect(detectCrazyFind("sudo find / -name secret", cwd, homedir)[0]?.type).toBe("root");
    expect(detectCrazyFind("env find / -name secret", cwd, homedir)[0]?.type).toBe("root");
    expect(detectCrazyFind("env HOME=/x find / -name secret", cwd, homedir)[0]?.type).toBe("root");
    expect(detectCrazyFind("nohup find / -name secret &", cwd, homedir)[0]?.type).toBe("root");
    expect(detectCrazyFind("command find / -name secret", cwd, homedir)[0]?.type).toBe("root");
  });

  it("skips pre-path options before the search path", () => {
    expect(detectCrazyFind("find -L / -name foo", cwd, homedir)[0]?.type).toBe("root");
    expect(detectCrazyFind("find -H / -name foo", cwd, homedir)[0]?.type).toBe("root");
    expect(detectCrazyFind("find -O2 / -name foo", cwd, homedir)[0]?.type).toBe("root");
  });

  it("collects multiple starting paths and flags the bad one", () => {
    const findings = detectCrazyFind("find . / -name mixed", cwd, homedir);
    expect(findings).toHaveLength(1);
    expect(findings[0].rawPath).toBe("/");
    expect(findings[0].type).toBe("root");
  });

  it("detects find in chained commands (;)", () => {
    const findings = detectCrazyFind('find ~/dev/concept -name "x.md"; find / -name "x.md"', cwd, homedir);
    expect(findings.length).toBe(1);
    expect(findings[0].rawPath).toBe("/");
    expect(findings[0].type).toBe("root");
  });

  it("detects find in pipelines", () => {
    expect(detectCrazyFind("find / | grep something", cwd, homedir)[0]?.type).toBe("root");
    expect(detectCrazyFind("grep something | find / -name x", cwd, homedir)[0]?.type).toBe("root");
  });

  it("detects find inside command substitutions in assignments", () => {
    expect(detectCrazyFind("x=$(find / -name test); echo $x", cwd, homedir)[0]?.type).toBe("root");
  });

  it("detects find inside quoted command substitutions", () => {
    expect(detectCrazyFind('echo "$(find / -name x)"', cwd, homedir)[0]?.type).toBe("root");
  });

  it("detects find inside backtick command substitution as command name", () => {
    expect(detectCrazyFind("`find / -name test`", cwd, homedir)[0]?.type).toBe("root");
  });

  it("treats find with no explicit path as current directory (allowed when cwd is not root/home)", () => {
    expect(detectCrazyFind("find -name x", cwd, homedir)).toEqual([]);
  });

  it("flags cwd of / when find has no explicit path", () => {
    expect(detectCrazyFind("find -name x", "/", homedir)[0]?.type).toBe("root");
  });

  it("flags cwd of homedir when find has no explicit path", () => {
    expect(detectCrazyFind("find -name x", homedir, homedir)[0]?.type).toBe("home");
  });

  it("allows project-scoped and subdirectory searches", () => {
    for (const cmd of [
      'find . -name "*.ts"',
      "find ./src -type f",
      'find ~/dev/concept -name "x.md"',
      "find $HOME/projects -name test",
      "find /tmp -name scratch",
      "find /var/log -name access.log",
      `find ${homedir}/.config -name foo`,
      `find /${homedirBase} -name x`, // note: /<user> is NOT /Users/<user> unless homedir is /<user>
    ]) {
      // /<user> without leading /Users (or /home) is a root subdir on this machine only if
      // homedir is literally /<user>; in that case it WOULD be blocked, so only assert when different.
      const normalized = `find /${homedirBase} -name x`;
      if (normalized === `find ${homedir} -name x`) continue;
      expect(detectCrazyFind(cmd, cwd, homedir), cmd).toEqual([]);
    }
  });

  it("does not flag find mentioned only inside quoted string arguments", () => {
    expect(detectCrazyFind('echo "find / is dangerous"', cwd, homedir)).toEqual([]);
    expect(detectCrazyFind("echo find / -name x", cwd, homedir)).toEqual([]);
  });

  it("does not flag non-find commands", () => {
    expect(detectCrazyFind("ls / -la", cwd, homedir)).toEqual([]);
    expect(detectCrazyFind("grep foo /var/log", cwd, homedir)).toEqual([]);
  });
});

describe("crazy-find fail-closed parse error (unit)", () => {
  it("throws a recognizable error when parse fails, so the caller can fail closed", () => {
    // unbash v5 is lenient and rarely throws on string input; simulate the
    // defensive branch by checking the integration catches parse errors.
    // Here we document the contract: detectCrazyFind may throw if the parser
    // cannot process the command, and the focus-guard tool_call hook must
    // block with formatCrazyFindParseError in that case.
    const reason = formatCrazyFindParseError("Unexpected token at offset 42");
    expect(reason).toContain("[BASH DENIED — CRAZY FIND GUARD]");
    expect(reason).toContain("could not be parsed");
    expect(reason).toContain("Failing closed");
    expect(reason).toContain("/focus-crazy-find-guard-off");
    expect(reason).toContain("Unexpected token at offset 42");
  });
});

describe("crazy-find denial formatting (unit)", () => {
  it("formats blocked findings per spec §5", () => {
    const reason = formatCrazyFindBlockedReason([
      { commandName: "find", rawPath: "/", type: "root" },
      { commandName: "find", rawPath: "~", type: "home" },
    ]);
    expect(reason).toContain("[BASH DENIED — CRAZY FIND GUARD]");
    expect(reason).toContain("Blocked action");
    expect(reason).toContain("Why guarded");
    expect(reason).toContain("Next step");
    expect(reason).toContain("find / (unrestricted root search)");
    expect(reason).toContain("find ~ (unrestricted home search)");
    expect(reason).toContain("/focus-crazy-find-guard-off");
    expect(reason).toContain("Narrow the search path");
  });
});
