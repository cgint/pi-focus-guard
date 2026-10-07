import { parse } from "unbash";
import * as path from "node:path";
import type { Command, SyntaxNode, Word } from "unbash";

export interface CrazyFindFinding {
  commandName: string;
  rawPath: string;
  type: "root" | "home";
}

// Pre-path options that do NOT terminate path collection.
// -H, -L, -P (POSIX); -E, -X, -f, -s, -x (BSD/macOS); -O* (GNU, single word like -O1..-O9); -D (GNU, followed by a value word).
const PRE_PATH_OPTIONS_WITHOUT_VALUE = new Set(["-H", "-L", "-P", "-E", "-X", "-f", "-s", "-x"]);
const PRE_PATH_OPTION_WITH_VALUE = "-D";
const GNU_OPTLEVEL_PREFIX = "-O";

const WRAPPERS = new Set(["sudo", "env", "nohup", "command"]);

export function detectCrazyFind(command: string, cwd: string, homedir: string): CrazyFindFinding[] {
  const script = parse(command);
  const findings: CrazyFindFinding[] = [];
  walkNode(script, cwd, homedir, findings);
  return findings;
}

function isFindCommandName(name: string): boolean {
  return name === "find" || name.endsWith("/find");
}

function unwrapCommand(cmd: Command): Command | null {
  if (!cmd.name) return null;
  const name = cmd.name.value;
  if (!WRAPPERS.has(name)) return null;

  // Find the first suffix word that is the wrapped command name:
  // - not an assignment (contains '='), e.g. env HOME=/x
  // - not a flag (starts with '-')
  for (let i = 0; i < (cmd.suffix?.length ?? 0); i++) {
    const suffix = cmd.suffix[i];
    if (suffix.type !== "Word") continue;
    const value = suffix.value;
    if (value.includes("=")) continue; // e.g. env HOME=/x
    if (value.startsWith("-")) continue; // e.g. nohup -u user
    // This is the actual command being wrapped
    const rest = cmd.suffix.slice(i + 1);
    return {
      ...cmd,
      name: suffix,
      prefix: [],
      suffix: rest,
    } as Command;
  }
  return null;
}

// Explicit structural walk of the unbash AST.
// NOTE: unbash exposes `parts`, `value` on Word/Assignment as prototype getters,
// so a generic Object.keys recursion would miss them — walk structurally instead.
function walkNode(node: SyntaxNode, cwd: string, homedir: string, findings: CrazyFindFinding[]): void {
  if (!node || typeof node !== "object") return;

  const n = node as { type?: string; commands?: SyntaxNode[]; command?: SyntaxNode; body?: SyntaxNode; clause?: SyntaxNode; then?: SyntaxNode; else?: SyntaxNode };

  switch (n.type) {
    case "Script":
      for (const c of n.commands ?? []) walkNode(c, cwd, homedir, findings);
      break;
    case "Statement":
      if (n.command) walkNode(n.command, cwd, homedir, findings);
      break;
    case "Command": {
      const cmd = node as Command;
      if (cmd.name) {
        // Unwrap wrappers (sudo, env, nohup, command)
        const unwrapped = unwrapCommand(cmd);
        const effective = unwrapped ?? cmd;
        if (isFindCommandName(effective.name?.value ?? "")) {
          const paths = extractFindStartingPaths(effective);
          for (const p of paths) {
            const classified = classifyPath(p, cwd, homedir);
            if (classified) {
              findings.push({ commandName: effective.name?.value ?? "find", rawPath: p, type: classified });
            }
          }
        }
      }
      // Recurse into prefix (Assignments may carry CommandExpansions in their value Word)
      for (const p of cmd.prefix ?? []) {
        if (p.type === "Assignment") {
          const valueWord = (p as { value?: Word }).value;
          if (valueWord) walkWord(valueWord, cwd, homedir, findings);
        }
      }
      // Recurse into suffix words (CommandExpansion parts, e.g. echo "$(find / ...)")
      for (const w of cmd.suffix ?? []) {
        if (w.type === "Word") walkWord(w, cwd, homedir, findings);
      }
      // Recurse into command name (backtick form: `find / -name test` as a command name)
      if (cmd.name && cmd.name.type === "Word") {
        walkWord(cmd.name as Word, cwd, homedir, findings);
      }
      break;
    }
    case "Pipeline":
    case "AndOr":
    case "OrAnd":
      for (const c of n.commands ?? []) walkNode(c, cwd, homedir, findings);
      break;
    case "If":
    case "Case":
    case "For":
    case "While":
    case "Until":
    case "Block":
      // Cover compound structures: body, clause(s), then, else, caseBody
      if (n.body) walkNode(n.body, cwd, homedir, findings);
      if (n.clause) walkNode(n.clause, cwd, homedir, findings);
      if (n.then) walkNode(n.then, cwd, homedir, findings);
      if (n.else) walkNode(n.else, cwd, homedir, findings);
      // Also handle `clauses` array (If/Case arms)
      for (const k of Object.keys(node)) {
        if (k === "pos" || k === "end" || k === "type") continue;
        const v = (node as any)[k];
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0]?.type) {
          for (const item of v) walkNode(item as SyntaxNode, cwd, homedir, findings);
        }
      }
      break;
    case "Subshell":
    case "BraceGroup": {
      // Subshell/brace group content lives in `body` (a CompoundList)
      const body = (node as { body?: SyntaxNode }).body;
      if (body) walkNode(body, cwd, homedir, findings);
      break;
    }
    case "CompoundList":
      for (const c of n.commands ?? []) walkNode(c, cwd, homedir, findings);
      break;
    default:
      break;
  }
}

function walkWord(word: Word, cwd: string, homedir: string, findings: CrazyFindFinding[]): void {
  walkPartsForCommandExpansions(word.parts ?? [], cwd, homedir, findings);
}

function walkPartsForCommandExpansions(
  parts: readonly SyntaxNode[],
  cwd: string,
  homedir: string,
  findings: CrazyFindFinding[],
): void {
  for (const part of parts) {
    if (part.type === "CommandExpansion" && (part as { script?: SyntaxNode }).script) {
      walkNode((part as { script: SyntaxNode }).script, cwd, homedir, findings);
    }
    // CommandExpansion can be nested inside quoted parts (e.g. DoubleQuoted.parts[].type === "CommandExpansion")
    const nestedParts = (part as { parts?: SyntaxNode[] }).parts;
    if (Array.isArray(nestedParts)) {
      walkPartsForCommandExpansions(nestedParts, cwd, homedir, findings);
    }
  }
}

function extractFindStartingPaths(cmd: Command): string[] {
  const paths: string[] = [];
  const suffix = cmd.suffix ?? [];
  let i = 0;
  while (i < suffix.length) {
    const word = suffix[i];
    if (word.type !== "Word") break;
    const value = word.value;

    // Pre-path options: skip (and optionally skip a value word)
    if (PRE_PATH_OPTIONS_WITHOUT_VALUE.has(value)) {
      i++;
      continue;
    }
    if (value === PRE_PATH_OPTION_WITH_VALUE) {
      // -D is followed by a value word to skip
      i += 2;
      continue;
    }
    if (value.startsWith(GNU_OPTLEVEL_PREFIX) && value.length > 2 && !value.startsWith("-O-")) {
      // GNU -O1 .. -O9 (single word, no separate value)
      i++;
      continue;
    }

    // Terminate path collection on any other flag or operator
    if (value.startsWith("-") || value === "(" || value === ")" || value === "!" || value === ",") {
      break;
    }

    // This is a starting path
    paths.push(value);
    i++;
  }

  // If no path collected, find defaults to `.` (current working directory)
  if (paths.length === 0) {
    paths.push(".");
  }

  return paths;
}

function classifyPath(rawPath: string, cwd: string, homedir: string): "root" | "home" | null {
  // --- Root check ---
  if (isRootPath(rawPath, cwd)) {
    return "root";
  }

  // --- Home check ---
  if (isHomePath(rawPath, homedir, cwd)) {
    return "home";
  }

  return null;
}

function isRootPath(raw: string, cwd: string): boolean {
  // Raw path is `/` or `/+` variants, or `/./` variants
  if (raw === "/" || /^\/+$/.test(raw) || /^\/(\.\/)*\.?$/.test(raw)) {
    return true;
  }
  // Normalize: collapse duplicate slashes and strip trailing slash/`/./`
  const normalized = normalizeTrailing(raw);
  if (normalized === "/") return true;
  // Relative `.` resolving to cwd being / (rare but spec mentions it)
  if (raw === "." || raw === "./") {
    return path.resolve(cwd) === "/";
  }
  return false;
}

function isHomePath(raw: string, homedir: string, cwd: string): boolean {
  // Tilde forms
  const homedirBase = path.basename(homedir);
  if (raw === "~" || raw === "~/") return true;
  if (raw === `~${homedirBase}` || raw === `~${homedirBase}/`) return true;

  // $HOME / ${HOME} forms (unquoted value)
  if (raw === "$HOME" || raw === "${HOME}" || raw === "$HOME/" || raw === "${HOME}/") return true;

  // Direct path equal to homedir (or with trailing slash)
  const normalized = normalizeTrailing(raw);
  if (normalized === homedir || normalized === path.normalize(homedir)) return true;

  // Relative path resolving to homedir
  if (raw === "." || raw === "./") {
    const resolved = path.resolve(cwd);
    return resolved === homedir || resolved === path.normalize(homedir);
  }
  if (!path.isAbsolute(raw)) {
    const resolved = path.resolve(cwd, raw);
    if (resolved === homedir || resolved === path.normalize(homedir)) return true;
  }

  return false;
}

function normalizeTrailing(p: string): string {
  // Strip trailing slashes, except root
  let result = p;
  while (result.length > 1 && result.endsWith("/")) {
    result = result.slice(0, -1);
  }
  // Collapse duplicate slashes (e.g., /// -> /)
  result = result.replace(/\/+/g, "/");
  // Remove /./ segments
  result = result.replace(/\/(\.\/)+/g, "/").replace(/\/\.$/, "");
  if (result === "") result = "/";
  return result;
}
