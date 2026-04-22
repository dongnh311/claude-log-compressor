import type { Symbol, SymbolKind } from "../../types.js";
import { formatLineRange, kindLabel, loadAndGuard } from "../utils.js";

export interface ListSymbolsInput {
  path: string;
  kinds?: SymbolKind[];
  depth?: number;
}

export async function listSymbols(input: ListSymbolsInput): Promise<string> {
  const result = await loadAndGuard(input.path);
  if ("error" in result) return result.error;
  const { parsed } = result;

  const kinds = input.kinds && input.kinds.length > 0 ? new Set(input.kinds) : null;
  const maxDepth = input.depth === undefined ? -1 : input.depth;

  const lines: string[] = [];
  lines.push(
    `File: ${parsed.path}`,
    `Language: ${parsed.language} · ${parsed.line_count} lines · ~${parsed.token_estimate} tokens`,
    `file_id: ${parsed.file_id}`,
    "",
    "SYMBOLS",
    "---------------------------------------------------------",
  );

  const count = emit(parsed.symbols, 0, maxDepth, kinds, lines);
  lines.push("");
  lines.push(`(${count} symbols listed)`);
  return lines.join("\n");
}

function emit(
  symbols: Symbol[],
  depth: number,
  maxDepth: number,
  kinds: Set<SymbolKind> | null,
  out: string[],
): number {
  let count = 0;
  for (const s of symbols) {
    const include = !kinds || kinds.has(s.kind);
    if (include) {
      const indent = "  ".repeat(depth);
      const range = formatLineRange(s.line_range[0], s.line_range[1]);
      const mods = s.modifiers.length ? `${s.modifiers.join(" ")} ` : "";
      out.push(`${indent}${mods}${kindLabel(s.kind)} ${s.qualified_name} ${range}`);
      count++;
    }
    if (maxDepth < 0 || depth < maxDepth) {
      count += emit(s.children, depth + 1, maxDepth, kinds, out);
    }
  }
  return count;
}
