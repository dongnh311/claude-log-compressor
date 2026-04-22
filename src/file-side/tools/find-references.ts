import type { Symbol } from "../../types.js";
import { loadParsedFile } from "../file-cache.js";
import { flattenSymbolTree } from "../utils.js";

export interface FindReferencesInput {
  path: string;
  identifier: string;
  context_lines?: number;
}

const MAX_MATCHES = 50;

export async function findReferencesInFile(input: FindReferencesInput): Promise<string> {
  const { parsed, source } = await loadParsedFile(input.path);
  const contextLines = input.context_lines ?? 2;

  let re: RegExp;
  try {
    re = new RegExp(`\\b${escapeRegex(input.identifier)}\\b`, "g");
  } catch {
    return `[error] invalid identifier: ${input.identifier}`;
  }

  const lines = source.split("\n");
  const flatSymbols = flattenSymbolTree(parsed.symbols);

  // Single-pass regex over the full source; derive line numbers from byte offsets.
  type Match = { line: number; enclosing: string | null };
  const matches: Match[] = [];
  const seenLines = new Set<number>();
  for (const m of source.matchAll(re)) {
    const offset = m.index ?? 0;
    const lineNumber = (source.slice(0, offset).match(/\n/g)?.length ?? 0) + 1;
    if (seenLines.has(lineNumber)) continue;
    seenLines.add(lineNumber);
    matches.push({ line: lineNumber, enclosing: enclosingSymbol(lineNumber, flatSymbols) });
    if (matches.length >= MAX_MATCHES) break;
  }

  if (matches.length === 0) {
    return `[${input.identifier}] 0 matches in ${parsed.path}`;
  }

  const out: string[] = [
    `File: ${parsed.path}`,
    `Identifier: ${input.identifier}`,
    `${matches.length} match${matches.length === 1 ? "" : "es"}${matches.length === MAX_MATCHES ? " (capped)" : ""}`,
    "",
  ];

  let prevEnd = -2;
  for (const m of matches) {
    const start = Math.max(1, m.line - contextLines);
    const end = Math.min(lines.length, m.line + contextLines);
    if (start > prevEnd + 1) out.push("---");
    for (let i = start; i <= end; i++) {
      const marker = i === m.line ? "►" : " ";
      out.push(`${marker} ${i}: ${lines[i - 1] ?? ""}`);
    }
    if (m.enclosing) out.push(`  (inside ${m.enclosing})`);
    prevEnd = end;
  }

  return out.join("\n");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function enclosingSymbol(lineNumber: number, flat: Symbol[]): string | null {
  // Find the innermost symbol whose line_range contains this line.
  let best: Symbol | null = null;
  let bestSpan = Number.POSITIVE_INFINITY;
  for (const s of flat) {
    const [lo, hi] = s.line_range;
    if (lineNumber < lo || lineNumber > hi) continue;
    const span = hi - lo;
    if (span < bestSpan) {
      best = s;
      bestSpan = span;
    }
  }
  return best?.qualified_name ?? null;
}
