import type { CrazyFindFinding } from "./crazy-find-detect.js";

/**
 * Format the denial message for a blocked crazy-find invocation.
 * Follows the spec §5 structure: header, "Blocked action", "Why guarded", "Next step".
 */
export function formatCrazyFindBlockedReason(findings: CrazyFindFinding[]): string {
  const blockedList = findings
    .map((f) => `  find ${f.rawPath} (unrestricted ${f.type} search)`)
    .join("\n");

  return (
    `[BASH DENIED — CRAZY FIND GUARD]\n\n` +
    `Blocked action\n` +
    `Bash command contains an unrestricted root or home directory search:\n` +
    `${blockedList}\n\n` +
    `Why guarded\n` +
    `Searching the entire root directory ('/') or user home directory leads to excessive ` +
    `latency, massive output, and frozen agent turns. In virtually all cases, locating project ` +
    `files only requires searching specific directories (e.g. './src', '~/dev/...').\n\n` +
    `Next step\n` +
    `1. Narrow the search path to the specific project or directory of interest.\n` +
    `2. If this unrestricted search is truly required and requested by the user, ask the user to run:\n` +
    `     /focus-crazy-find-guard-off\n` +
    `   in their chat prompt to lift this restriction.`
  );
}

/**
 * Format the fail-closed denial when the bash parser cannot parse a command
 * that contains `find`. Spec §7: fail closed.
 */
export function formatCrazyFindParseError(errorMessage: string): string {
  return (
    `[BASH DENIED — CRAZY FIND GUARD]\n\n` +
    `Blocked action\n` +
    `Bash command could not be parsed for safety analysis (contains "find").\n\n` +
    `Why guarded\n` +
    `The command could not be fully parsed, so the crazy-find guard cannot verify that no ` +
    `unrestricted find (root or home directory) is present. Failing closed to prevent a ` +
    `potential runaway search.\n` +
    `Parser error: ${errorMessage}\n\n` +
    `Next step\n` +
    `1. Simplify or rephrase the command (remove nested quoting, complex substitutions) and retry.\n` +
    `2. If the command does not actually contain a risky find, the user may run:\n` +
    `     /focus-crazy-find-guard-off\n` +
    `   in their chat prompt to lift this restriction.`
  );
}
