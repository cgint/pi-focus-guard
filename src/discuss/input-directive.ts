import type { DiscussMode } from "./config.js";

export type DiscussInputDirectiveResult =
  | { mode: DiscussMode; text: string }
  | { multiple: true; text: string }
  | { text: string };

const PREFIX_PATTERN = /^\s*-(do|db|dr):[ \t]*/i;
const SUFFIX_PATTERN = /\n[ \t]*-(do|db|dr):[ \t]*$/i;
const STANDALONE_DIRECTIVE_PATTERN = /(?:^|\n)[ \t]*-(do|db|dr):[ \t]*(?:\n|$)/i;

function modeForDirective(value: string): DiscussMode {
  if (value.toLowerCase() === "do") return "off";
  if (value.toLowerCase() === "db") return "block";
  return "read";
}

export function parseDiscussInputDirective(text: string): DiscussInputDirectiveResult {
  const prefix = PREFIX_PATTERN.exec(text);
  const suffix = SUFFIX_PATTERN.exec(text);
  const hasEarlierStandaloneDirective = suffix
    ? STANDALONE_DIRECTIVE_PATTERN.test(text.slice(0, suffix.index))
    : false;

  if (prefix && suffix || hasEarlierStandaloneDirective) return { multiple: true, text };

  if (prefix) {
    return {
      mode: modeForDirective(prefix[1]),
      text: text.slice(prefix[0].length).trimStart(),
    };
  }

  if (suffix) {
    return {
      mode: modeForDirective(suffix[1]),
      text: text.slice(0, suffix.index).trimEnd(),
    };
  }

  return { text };
}
