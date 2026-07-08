import { parse } from "unbash";
import type { Script } from "unbash";
import { extractWriteTargets, isAlwaysSafe } from "./bash-detect.js";

/**
 * Determine whether a bash command has zero write surface.
 *
 * Returns `true` only if the parsed AST reveals no write redirects,
 * no writer commands, and no dynamic (unresolvable) paths.
 *
 * On parse failure the command is treated as unsafe (fail-closed).
 */
export function isBashCommandReadOnly(commandLine: string): boolean {
  if (!commandLine || !commandLine.trim()) return false;

  let ast: Script;
  try {
    ast = parse(commandLine);
  } catch {
    // Parse error → fail-closed
    return false;
  }

  const findings = extractWriteTargets(ast);

  for (const finding of findings) {
    if (isAlwaysSafe(finding.path)) continue;
    if (finding.path === "__dynamic__") return false;
    return false; // any concrete write target → not read-only
  }

  return true;
}