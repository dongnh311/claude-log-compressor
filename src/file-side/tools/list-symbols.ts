import type { Symbol, SymbolKind } from "../../types.js";
import { loadParsedFile } from "../file-cache.js";

export interface ListSymbolsInput {
  path: string;
  kinds?: SymbolKind[];
  depth?: number;
}

export async function listSymbols(input: ListSymbolsInput): Promise<string> {
  const { parsed } = await loadParsedFile(input.path);
  if (parsed.parse_status === "failed") {
    return `[error] could not parse ${input.path}: ${parsed.parse_errors.join("; ")}`;
  }

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
      const range = `[L${s.line_range[0]}-L${s.line_range[1]}]`;
      const mods = s.modifiers.length ? `${s.modifiers.join(" ")} ` : "";
      out.push(`${indent}${mods}${kindSymbol(s.kind)} ${s.qualified_name} ${range}`);
      count++;
    }
    if (maxDepth < 0 || depth < maxDepth) {
      count += emit(s.children, depth + 1, maxDepth, kinds, out);
    }
  }
  return count;
}

function kindSymbol(kind: SymbolKind): string {
  switch (kind) {
    case "class":
      return "class";
    case "interface":
      return "interface";
    case "enum":
      return "enum";
    case "object":
      return "object";
    case "struct":
      return "struct";
    case "trait":
      return "trait";
    case "function":
      return "fun";
    case "method":
      return "method";
    case "constructor":
      return "constructor";
    case "property":
      return "property";
    case "field":
      return "field";
    case "const":
      return "const";
    case "type_alias":
      return "type";
    case "namespace":
      return "namespace";
    case "module":
      return "module";
  }
}
