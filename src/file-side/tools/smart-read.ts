import { readFileSync } from "node:fs";
import type { Symbol } from "../../types.js";
import { loadParsedFile } from "../file-cache.js";
import { formatFull, formatOutlineOnly, formatWithFocus } from "../formatter.js";

export interface SmartReadInput {
  path: string;
  focus?: string;
  mode?: "outline" | "full" | "auto";
  max_tokens?: number;
}

const SMALL_FILE_MAX_LINES = 300;
const SMALL_FILE_MAX_TOKENS = 1500;

export async function smartRead(input: SmartReadInput): Promise<string> {
  const mode = input.mode ?? "auto";
  const maxTokens = input.max_tokens ?? 2000;

  // Always try the file-cache; but in full-mode / fallback, we also need the raw source.
  const { parsed, source } = await loadParsedFile(input.path);

  if (parsed.parse_status === "failed") {
    // Unsupported language or parse error — return full as fallback.
    if (parsed.language === null && input.mode !== "outline") {
      return formatFull(parsed, source).text;
    }
    return `[error] could not parse ${input.path}: ${parsed.parse_errors.join("; ")}`;
  }

  if (mode === "full") {
    return formatFull(parsed, source).text;
  }

  const smallFile =
    parsed.line_count <= SMALL_FILE_MAX_LINES && parsed.token_estimate <= SMALL_FILE_MAX_TOKENS;

  if (smallFile && !input.focus) {
    return formatFull(parsed, source).text;
  }

  if (input.focus) {
    const matches = matchSymbols(parsed.symbols, input.focus);
    if (matches.length === 0) {
      // No match — fall back to outline with a note.
      const r = formatOutlineOnly(parsed);
      return `${r.text}\n\n[note] focus='${input.focus}' matched no symbols in this file.`;
    }
    return formatWithFocus(parsed, source, matches, { focus: input.focus, maxTokens }).text;
  }

  // mode='auto' large file no focus, OR mode='outline' → outline only
  return formatOutlineOnly(parsed).text;
}

function matchSymbols(symbols: Symbol[], focus: string): Symbol[] {
  const flat: Symbol[] = [];
  const walk = (list: Symbol[]): void => {
    for (const s of list) {
      flat.push(s);
      walk(s.children);
    }
  };
  walk(symbols);

  // Exact qualified match first.
  const exact = flat.filter((s) => s.qualified_name === focus || s.name === focus);
  if (exact.length > 0) return exact;

  // Try regex.
  let re: RegExp;
  try {
    re = new RegExp(focus, "i");
  } catch {
    return [];
  }
  return flat.filter((s) => re.test(s.name) || re.test(s.qualified_name));
}

// Re-export for test convenience — not used by the server dispatcher directly.
export const __internal = { matchSymbols, readFileSync };
