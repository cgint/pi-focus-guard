import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { parse } from "unbash";
import type { Script } from "unbash";
import {
  getEffectivePolicy as getWriteEffectivePolicy,
  parseDirsArgList,
  resolveAllowedDirs,
  formatResolvedList,
  type SessionOverride,
} from "./write/config.js";
import { canonicalizeTargetPath, isPathInside, realpathIfExists, resolveMaybeRelative } from "./write/path-utils.js";
import { extractWriteTargets, isAlwaysSafe, type WriteFinding } from "./write/bash-detect.js";
import {
  getEffectivePolicy as getDiscussEffectivePolicy,
  type ActiveMode,
  type DiscussMode,
  type EffectivePolicy as DiscussEffectivePolicy,
} from "./discuss/config.js";
import { isBashCommandReadOnly } from "./discuss/is-readonly.js";
import { parseDiscussInputDirective } from "./discuss/input-directive.js";

const WRITE_PERSIST_TYPE = "write-guard";
const DISCUSS_PERSIST_TYPE = "discuss-mode";
const COMMIT_PERSIST_TYPE = "focus-commit-guard";

const WRITE_STATUS_KEY = "a2_write_guard";
const DISCUSS_STATUS_KEY = "a1_discuss";
export const COMMIT_GUARD_STATUS_KEY = "a3_commit_guard";

const GUARD_SYMBOL_OFF = "✍️";
const GUARD_SYMBOL_PROJECT = "🔰";
const GUARD_SYMBOL_RESTRICTED = "🛡️";

const DISCUSS_MODE_SYMBOLS: Record<DiscussMode, string> = {
  off: "✅",
  block: "🔒",
  read: "📖",
};

const COMMIT_GUARD_SYMBOL_OFF = "📝";
const COMMIT_GUARD_SYMBOL_ON = "🚫";

const POLICY_INTRO =
  "The user has restricted write operations to specific directories.";
const POLICY_ALLOWLIST_LABEL = "Writes must stay under these directories:";
const POLICY_CLOSE =
  "If this restriction blocks the intended work, ask the user to update the write guard.";

export const READ_MODE_ALLOWED_TOOLS = new Set([
  "read",
  "ls",
  "find",
  "grep",
  "advisor",
  "web_search",
  "fetch_content",
  "get_search_content",
]);

export const READ_MODE_ALLOWED_DISPLAY =
  "bash(read-only), " + Array.from(READ_MODE_ALLOWED_TOOLS).join(", ");

let writeSessionOverride: SessionOverride | null = null;
let activeDiscussMode: ActiveMode = { mode: "off", explicit: false };
let commitGuardEnabled = false;

function buildDenyReason(detail: string, allowedDirs: string[]): string {
  const allowlist =
    allowedDirs.length > 0
      ? allowedDirs.map((d) => `  ${d}`).join("\n")
      : "  (none)";
  return (
    `DENIED: ${detail}\n\n` +
    `${POLICY_INTRO}\n\n` +
    `${POLICY_ALLOWLIST_LABEL}\n` +
    `${allowlist}\n\n` +
    `${POLICY_CLOSE}`
  );
}

export function isToolAllowedByDiscussPolicy(toolName: string, policy: DiscussEffectivePolicy): boolean {
  if (!policy.enforce) return true;
  if (policy.mode === "block") return false;
  return READ_MODE_ALLOWED_TOOLS.has(toolName);
}

export function formatDiscussBlockedToolReason(_toolName: string, policy: DiscussEffectivePolicy): string {
  if (!policy.enforce) return "";

  return `[TOOL CALL DENIED — HARD BLOCK]\n\nYou are in **discuss mode**. The user has chosen this mode so you can think, analyze, and discuss — not take action. No tool calls will execute.\n\nIf you need to perform actions, describe what you'd like to do and ask the user if they want to switch out of discuss mode.`;
}

export function formatCommitGuardBlockedReason(): string {
  return "[COMMIT DENIED — REVIEW FIRST]\n\nCommit guard is enabled. The user intentionally does not want changes committed yet. Finish the collaborative work, review git diff together, and ask the user before creating a commit.";
}

function commandContainsGitCommit(command: string): boolean {
  return command.includes("git commit");
}

export default function focusGuard(pi: ExtensionAPI) {
  pi.registerFlag("write-guard", {
    description: "Write-allowed dirs, comma-separated (e.g. ./docs,./openspec)",
    type: "string",
  });

  pi.registerFlag("write-guard-all", {
    description: "Start session with write guard disabled",
    type: "boolean",
  });

  pi.registerFlag("write-guard-off", {
    description: "Start session with write guard disabled",
    type: "boolean",
  });

  pi.registerFlag("dm-off", {
    description: "Start session with discuss mode disabled",
    type: "boolean",
  });

  pi.registerFlag("dm-read", {
    description: "Start session in discuss read-only mode (shortcut for --discuss-mode read)",
    type: "boolean",
  });

  pi.registerFlag("dm-block", {
    description: "Start session in discuss block mode (shortcut for --discuss-mode block)",
    type: "boolean",
  });

  pi.registerFlag("commit-guard", {
    description: "Start session with commit guard enabled",
    type: "boolean",
  });

  pi.registerFlag("commit-guard-on", {
    description: "Start session with commit guard enabled",
    type: "boolean",
  });

  pi.registerFlag("commit-guard-off", {
    description: "Start session with commit guard disabled",
    type: "boolean",
  });

  function persistWriteOverride(): void {
    if (!writeSessionOverride) return;
    pi.appendEntry(WRITE_PERSIST_TYPE, writeSessionOverride);
  }

  function persistDiscussOverride(): void {
    if (activeDiscussMode.mode === "off") return;
    pi.appendEntry(DISCUSS_PERSIST_TYPE, activeDiscussMode);
  }

  function persistCommitGuard(): void {
    pi.appendEntry(COMMIT_PERSIST_TYPE, { enabled: commitGuardEnabled });
  }

  async function updateWriteStatus(ctx: ExtensionContext): Promise<void> {
    if (!ctx.hasUI) return;
    const policy = await getWriteEffectivePolicy(pi.getFlag("write-guard"), writeSessionOverride, ctx.cwd);
    if (!policy.enforce) {
      ctx.ui.setStatus?.(WRITE_STATUS_KEY, GUARD_SYMBOL_OFF);
      return;
    }
    const resolved = await resolveAllowedDirs(policy.dirs, ctx.cwd);
    const cwdReal = await realpathIfExists(ctx.cwd);
    const isProjectOnly = resolved.length === 1 && resolved[0] === cwdReal;
    ctx.ui.setStatus?.(WRITE_STATUS_KEY, isProjectOnly ? GUARD_SYMBOL_PROJECT : GUARD_SYMBOL_RESTRICTED);
  }

  function updateDiscussStatus(ctx: ExtensionContext, mode: DiscussMode): void {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus?.(DISCUSS_STATUS_KEY, DISCUSS_MODE_SYMBOLS[mode]);
  }

  function updateCommitStatus(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus?.(COMMIT_GUARD_STATUS_KEY, commitGuardEnabled ? COMMIT_GUARD_SYMBOL_ON : COMMIT_GUARD_SYMBOL_OFF);
  }

  function setDiscussMode(mode: DiscussMode): void {
    activeDiscussMode = { mode, explicit: true };
    persistDiscussOverride();
  }

  function applyInlineDiscussMode(mode: DiscussMode, ctx: ExtensionContext): void {
    setDiscussMode(mode);
    updateDiscussStatus(ctx, mode);

    if (!ctx.hasUI) return;
    if (mode === "off") {
      ctx.ui.notify("Discuss mode disabled for this session.", "info");
    } else if (mode === "block") {
      ctx.ui.notify("Discuss mode set to BLOCK for this session. All tool calls will be blocked.", "info");
    } else {
      ctx.ui.notify(`Discuss mode set to READ-ONLY for this session. Allowed tools: ${READ_MODE_ALLOWED_DISPLAY}.`, "info");
    }
  }

  async function setCommitGuard(enabled: boolean, ctx: ExtensionContext): Promise<void> {
    commitGuardEnabled = enabled;
    persistCommitGuard();
    updateCommitStatus(ctx);
    if (!ctx.hasUI) return;
    const content = enabled
      ? "Commit guard enabled — git commit is blocked until collaborative finishing and git diff review are complete."
      : "Commit guard disabled — git commit is no longer blocked by focus guard.";
    ctx.ui.notify(content, "info");
    await pi.sendMessage(
      { customType: COMMIT_PERSIST_TYPE, content, display: true },
      { triggerTurn: false },
    );
  }

  pi.registerCommand("focus-write-guard", {
    description: "Set write allowlist. E.g.: /focus-write-guard docs,openspec",
    handler: async (args, ctx) => {
      const argsTrimmed = (args ?? "").trim();

      if (!argsTrimmed) {
        if (!ctx.hasUI) return;
        const policy = await getWriteEffectivePolicy(pi.getFlag("write-guard"), writeSessionOverride, ctx.cwd);
        if (!policy.enforce) {
          ctx.ui.notify(`Write guard is not enforcing (source: ${policy.source}).`, "info");
          return;
        }
        const resolved = await resolveAllowedDirs(policy.dirs, ctx.cwd);
        ctx.ui.notify(`Write guard enforcing (source: ${policy.source}).\nAllowed under:\n${formatResolvedList(resolved)}\n\nTreat denied writes as policy boundaries, not technical failures to route around.`, "info");
        return;
      }

      const lower = argsTrimmed.toLowerCase();
      if (lower === "all") {
        writeSessionOverride = { mode: "off" };
        persistWriteOverride();
        await updateWriteStatus(ctx);
        if (ctx.hasUI) {
          ctx.ui.notify("Write guard disabled — no write restrictions for this session.", "info");
          await pi.sendMessage(
            { customType: WRITE_PERSIST_TYPE, content: "Write guard disabled — no write restrictions for this session.", display: true },
            { triggerTurn: false },
          );
        }
        return;
      }
      const dirs = parseDirsArgList(argsTrimmed);
      writeSessionOverride = { mode: "allow", dirs };
      persistWriteOverride();
      await updateWriteStatus(ctx);
      if (ctx.hasUI) {
        const resolved = await resolveAllowedDirs(dirs, ctx.cwd);
        const list = formatResolvedList(resolved);
        ctx.ui.notify(`Write guard set for this session.\nAllowed under:\n${list}\n\nTreat denied writes as policy boundaries, not technical failures to route around.`, "info");
        await pi.sendMessage(
          { customType: WRITE_PERSIST_TYPE, content: `Write guard set for this session.\nAllowed under:\n${list}\n\nTreat denied writes as policy boundaries, not technical failures to route around.`, display: true },
          { triggerTurn: false },
        );
      }
    },
  });

  pi.registerCommand("focus-write-guard-all", {
    description: "Disable write restrictions (same as /focus-write-guard all)",
    handler: async (_args, ctx) => {
      writeSessionOverride = { mode: "off" };
      persistWriteOverride();
      await updateWriteStatus(ctx);
      if (ctx.hasUI) {
        ctx.ui.notify("Write guard disabled — no write restrictions for this session.", "info");
        await pi.sendMessage(
          { customType: WRITE_PERSIST_TYPE, content: "Write guard disabled — no write restrictions for this session.", display: true },
          { triggerTurn: false },
        );
      }
    },
  });

  pi.registerCommand("focus-discuss", {
    description: "Show or set discussion mode. Usage: /focus-discuss off | block | read",
    handler: async (args, ctx) => {
      const argsTrimmed = (args ?? "").trim().toLowerCase();

      if (!argsTrimmed) {
        if (!ctx.hasUI) return;
        const policy = getDiscussEffectivePolicy(activeDiscussMode);
        if (!policy.enforce) {
          ctx.ui.notify(`Discuss mode is OFF .`, "info");
          return;
        }
        if (policy.mode === "read") {
          ctx.ui.notify(`Discuss mode is READ-ONLY . Allowed tools: ${READ_MODE_ALLOWED_DISPLAY}.`, "info");
          return;
        }
        ctx.ui.notify(`Discuss mode is BLOCK . All tool calls are blocked.`, "info");
        return;
      }

      if (argsTrimmed === "off" || argsTrimmed === "disable") {
        setDiscussMode("off");
        updateDiscussStatus(ctx, "off");
        if (ctx.hasUI) {
          ctx.ui.notify("Discuss mode disabled for this session.", "info");
          pi.sendMessage(
            { customType: DISCUSS_PERSIST_TYPE, content: "Strict-Discuss mode ended by user.", display: true },
            { triggerTurn: false },
          );
        }
        return;
      }

      if (argsTrimmed === "block" || argsTrimmed === "on" || argsTrimmed === "enable") {
        setDiscussMode("block");
        updateDiscussStatus(ctx, "block");
        if (ctx.hasUI) {
          ctx.ui.notify("Discuss mode set to BLOCK for this session. All tool calls will be blocked.", "info");
          pi.sendMessage(
            { customType: DISCUSS_PERSIST_TYPE, content: "Strict-Discuss mode started by user in BLOCK-mode. Let's align conceptually first. We are strictly stepping back from any tools to discuss ideas, architecture, or goals.", display: true },
            { triggerTurn: false },
          );
        }
        return;
      }

      if (argsTrimmed === "read" || argsTrimmed === "readonly" || argsTrimmed === "read-only") {
        setDiscussMode("read");
        updateDiscussStatus(ctx, "read");
        if (ctx.hasUI) {
          ctx.ui.notify(`Discuss mode set to READ-ONLY for this session. Allowed tools: ${READ_MODE_ALLOWED_DISPLAY}.`, "info");
          pi.sendMessage(
            { customType: DISCUSS_PERSIST_TYPE, content: `Strict-Discuss mode started by user in READ-ONLY-mode. Let's investigate together first. We want to read and inspect the information at hand to build a shared understanding, but hold off on making any changes yet. Allowed tools: ${READ_MODE_ALLOWED_DISPLAY}`, display: true },
            { triggerTurn: false },
          );
        }
        return;
      }

      if (ctx.hasUI) {
        ctx.ui.notify(`Unknown argument: "${args}". Use: off | block | read`, "warning");
      }
    },
  });

  pi.registerCommand("focus-discuss-off", {
    description: "Disable discuss mode (allow all tools). Shortcut for /focus-discuss off",
    handler: async (_args, ctx) => {
      setDiscussMode("off");
      updateDiscussStatus(ctx, "off");
      if (ctx.hasUI) {
        ctx.ui.notify("Discuss mode disabled for this session.", "info");
        pi.sendMessage(
          { customType: DISCUSS_PERSIST_TYPE, content: "Strict-Discuss mode ended by user.", display: true },
          { triggerTurn: false },
        );
      }
    },
  });

  pi.registerCommand("focus-discuss-read", {
    description: "Conservative read-only mode. Shortcut for /focus-discuss read",
    handler: async (_args, ctx) => {
      setDiscussMode("read");
      updateDiscussStatus(ctx, "read");
      if (ctx.hasUI) {
        ctx.ui.notify(`Discuss mode set to READ-ONLY for this session. Allowed tools: ${READ_MODE_ALLOWED_DISPLAY}.`, "info");
        pi.sendMessage(
          { customType: DISCUSS_PERSIST_TYPE, content: `Strict-Discuss mode started by user in READ-ONLY-mode. Let's investigate together first. We want to read and inspect the information at hand to build a shared understanding, but hold off on making any changes yet. Allowed tools: ${READ_MODE_ALLOWED_DISPLAY}`, display: true },
          { triggerTurn: false },
        );
      }
    },
  });

  pi.registerCommand("focus-discuss-block", {
    description: "Block all tool calls (full discuss mode). Shortcut for /focus-discuss block",
    handler: async (_args, ctx) => {
      setDiscussMode("block");
      updateDiscussStatus(ctx, "block");
      if (ctx.hasUI) {
        ctx.ui.notify("Discuss mode set to BLOCK for this session. All tool calls will be blocked.", "info");
        pi.sendMessage(
          { customType: DISCUSS_PERSIST_TYPE, content: "Strict-Discuss mode started by user in BLOCK-mode. Let's align conceptually first. We are strictly stepping back from any tools to discuss ideas, architecture, or goals.", display: true },
          { triggerTurn: false },
        );
      }
    },
  });

  pi.on("input", async (event, ctx) => {
    if (event.source === "extension") return { action: "continue" };

    const parsed = parseDiscussInputDirective(event.text);
    if ("multiple" in parsed) {
      if (ctx.hasUI) {
        ctx.ui.notify("Multiple discuss-mode directives found. Use only one of -do:, -db:, or -dr:.", "warning");
      }
      return { action: "continue" };
    }

    if (!("mode" in parsed)) return { action: "continue" };

    applyInlineDiscussMode(parsed.mode, ctx);
    if (!parsed.text.trim()) return { action: "handled" };

    return { action: "transform", text: parsed.text, images: event.images };
  });

  pi.registerCommand("focus-commit-guard", {
    description: "Show commit guard status",
    handler: async (_args, ctx) => {
      updateCommitStatus(ctx);
      if (!ctx.hasUI) return;
      ctx.ui.notify(commitGuardEnabled ? "Commit guard is ON — git commit is blocked until review." : "Commit guard is OFF — git commit is not blocked by focus guard.", "info");
    },
  });

  pi.registerCommand("focus-commit-guard-on", {
    description: "Block git commit bash commands until collaborative review is complete",
    handler: async (_args, ctx) => {
      await setCommitGuard(true, ctx);
    },
  });

  pi.registerCommand("focus-commit-guard-off", {
    description: "Allow git commit bash commands again",
    handler: async (_args, ctx) => {
      await setCommitGuard(false, ctx);
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    const entries = ctx.sessionManager.getEntries();

    const lastWrite = entries
      .filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === WRITE_PERSIST_TYPE)
      .pop() as { data?: SessionOverride } | undefined;
    if (lastWrite?.data) {
      writeSessionOverride = lastWrite.data;
      if (ctx.hasUI && lastWrite.data.mode === "allow") {
        const resolved = await resolveAllowedDirs(lastWrite.data.dirs, ctx.cwd);
        const list = formatResolvedList(resolved);
        await pi.sendMessage(
          { customType: WRITE_PERSIST_TYPE, content: `Write guard set for this session.\nAllowed under:\n${list}\n\nTreat denied writes as policy boundaries, not technical failures to route around.`, display: true },
          { triggerTurn: false },
        );
      }
    }

    const writeOff = pi.getFlag("write-guard-off") || pi.getFlag("write-guard-all");
    if (writeOff) {
      writeSessionOverride = { mode: "off" };
      persistWriteOverride();
      if (ctx.hasUI) {
        await pi.sendMessage(
          { customType: WRITE_PERSIST_TYPE, content: "Write guard disabled by startup flag — no write restrictions for this session.", display: true },
          { triggerTurn: false },
        );
      }
    }

    const dmOff = pi.getFlag("dm-off");
    const dmBlock = pi.getFlag("dm-block");
    const dmRead = pi.getFlag("dm-read");
    if (dmOff) {
      setDiscussMode("off");
      updateDiscussStatus(ctx, "off");
      if (ctx.hasUI) {
        await pi.sendMessage(
          { customType: DISCUSS_PERSIST_TYPE, content: "Strict-Discuss mode disabled by startup flag.", display: true },
          { triggerTurn: false },
        );
      }
    } else if (dmBlock) {
      setDiscussMode("block");
      updateDiscussStatus(ctx, "block");
      if (ctx.hasUI) {
        await pi.sendMessage(
          { customType: DISCUSS_PERSIST_TYPE, content: "Strict-Discuss mode started by user in BLOCK-mode (via --dm-block). Let's align conceptually first. We are strictly stepping back from any tools to discuss ideas, architecture, or goals.", display: true },
          { triggerTurn: false },
        );
      }
    } else if (dmRead) {
      setDiscussMode("read");
      updateDiscussStatus(ctx, "read");
      if (ctx.hasUI) {
        await pi.sendMessage(
          { customType: DISCUSS_PERSIST_TYPE, content: `Strict-Discuss mode started by user in READ-ONLY-mode (via --dm-read). Let's investigate together first. We want to read and inspect the information at hand to build a shared understanding, but hold off on making any changes yet. Allowed tools: ${READ_MODE_ALLOWED_DISPLAY}`, display: true },
          { triggerTurn: false },
        );
      }
    } else {
      const lastDiscuss = entries
        .filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === DISCUSS_PERSIST_TYPE)
        .pop() as { data?: ActiveMode } | undefined;
      if (lastDiscuss?.data) {
        activeDiscussMode = lastDiscuss.data;
      }
    }

    const commitOff = pi.getFlag("commit-guard-off");
    const commitOn = pi.getFlag("commit-guard") || pi.getFlag("commit-guard-on");
    const lastCommit = entries
      .filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === COMMIT_PERSIST_TYPE)
      .pop() as { data?: { enabled?: boolean } } | undefined;
    if (commitOff) {
      commitGuardEnabled = false;
      persistCommitGuard();
      if (ctx.hasUI) {
        await pi.sendMessage(
          { customType: COMMIT_PERSIST_TYPE, content: "Commit guard disabled by startup flag — git commit is not blocked by focus guard.", display: true },
          { triggerTurn: false },
        );
      }
    } else if (commitOn) {
      commitGuardEnabled = true;
      persistCommitGuard();
      if (ctx.hasUI) {
        await pi.sendMessage(
          { customType: COMMIT_PERSIST_TYPE, content: "Commit guard enabled by startup flag — git commit is blocked until collaborative review is complete.", display: true },
          { triggerTurn: false },
        );
      }
    } else if (lastCommit?.data) {
      commitGuardEnabled = lastCommit.data.enabled === true;
    }

    updateDiscussStatus(ctx, activeDiscussMode.mode);
    await updateWriteStatus(ctx);
    updateCommitStatus(ctx);
  });

  pi.on("tool_call", async (event, ctx) => {
    const discussPolicy = getDiscussEffectivePolicy(activeDiscussMode);
    if (!isToolAllowedByDiscussPolicy(event.toolName, discussPolicy)) {
      if (discussPolicy.mode === "read" && event.toolName === "bash") {
        const rawCommand = (event.input as { command?: unknown }).command;
        if (typeof rawCommand === "string" && rawCommand.trim()) {
          if (isBashCommandReadOnly(rawCommand.trim())) {
            return undefined;
          }
          return { block: true, reason: formatDiscussBlockedToolReason(event.toolName, discussPolicy) };
        }
      }

      return { block: true, reason: formatDiscussBlockedToolReason(event.toolName, discussPolicy) };
    }

    if (commitGuardEnabled && event.toolName === "bash") {
      const rawCommand = (event.input as { command?: unknown }).command;
      if (typeof rawCommand === "string" && commandContainsGitCommit(rawCommand)) {
        return { block: true, reason: formatCommitGuardBlockedReason() };
      }
    }

    if (!["write", "edit", "bash"].includes(event.toolName)) return undefined;

    const policy = await getWriteEffectivePolicy(pi.getFlag("write-guard"), writeSessionOverride, ctx.cwd);
    if (!policy.enforce) return undefined;

    if (event.toolName === "write" || event.toolName === "edit") {
      const targetPathRaw = (event.input as { path?: unknown }).path;
      if (typeof targetPathRaw !== "string" || !targetPathRaw.trim()) {
        return { block: true, reason: `Invalid path argument for ${event.toolName}` };
      }

      const absTarget = resolveMaybeRelative(targetPathRaw, ctx.cwd);
      const canonicalTarget = await canonicalizeTargetPath(absTarget);
      const resolvedAllowed = await resolveAllowedDirs(policy.dirs, ctx.cwd);
      const ok = resolvedAllowed.some((dir) => isPathInside(canonicalTarget, dir));
      if (ok) return undefined;

      const reason = buildDenyReason(
        `Write operation to '${targetPathRaw}' is outside the allowed directories.`,
        resolvedAllowed,
      );
      return { block: true, reason };
    }

    const rawCommand = (event.input as { command?: unknown }).command;
    if (typeof rawCommand !== "string" || !rawCommand.trim()) {
      return { block: true, reason: "Invalid command argument" };
    }

    const command = rawCommand.trim();

    let ast: Script;
    try {
      ast = parse(command);
    } catch (err) {
      return { block: true, reason: `Bash parse error: ${err instanceof Error ? err.message : String(err)}. Command blocked for safety.` };
    }

    let findings: WriteFinding[];
    try {
      findings = extractWriteTargets(ast);
    } catch (err) {
      return { block: true, reason: `AST analysis error: ${err instanceof Error ? err.message : String(err)}. Command blocked for safety.` };
    }

    if (findings.length === 0) return undefined;

    const resolvedAllowed = await resolveAllowedDirs(policy.dirs, ctx.cwd);
    const blocked: string[] = [];
    for (const finding of findings) {
      if (isAlwaysSafe(finding.path)) continue;
      if (finding.path === "__dynamic__") {
        blocked.push("dynamic path (unresolvable)");
        continue;
      }

      const absTarget = resolveMaybeRelative(finding.path, ctx.cwd);
      const canonicalTarget = await canonicalizeTargetPath(absTarget);
      const allowed = resolvedAllowed.some((dir) => isPathInside(canonicalTarget, dir));
      if (!allowed) {
        const sourceLabel = finding.source === "redirect" ? "redirect" : `${finding.commandName} command`;
        blocked.push(`${finding.path} (${sourceLabel})`);
      }
    }

    if (blocked.length > 0) {
      const blockedList = blocked.map(p => "  " + p).join("\n");
      const reason = buildDenyReason(
        `The bash command writes to:\n${blockedList}`,
        resolvedAllowed,
      );
      return { block: true, reason };
    }

    return undefined;
  });
}
