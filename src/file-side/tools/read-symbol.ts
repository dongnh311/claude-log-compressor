import { flattenSymbolTree, formatLineRange, loadAndGuard } from "../utils.js";

export interface ReadSymbolInput {
  path: string;
  names: string[];
  include_surrounding?: boolean;
}

export async function readSymbol(input: ReadSymbolInput): Promise<string> {
  const result = await loadAndGuard(input.path);
  if ("error" in result) return result.error;
  const { parsed, source } = result;

  const flat = flattenSymbolTree(parsed.symbols);

  const out: string[] = [`File: ${parsed.path}`, `file_id: ${parsed.file_id}`, ""];
  for (const requested of input.names) {
    const matches = flat.filter(
      (s) => s.qualified_name === requested || s.name === requested,
    );
    if (matches.length === 0) {
      out.push(`[error] symbol not found: ${requested}`);
      out.push("");
      continue;
    }
    for (const m of matches) {
      out.push(`${m.kind} ${m.qualified_name} ${formatLineRange(m.line_range[0], m.line_range[1])}`);
      if (m.doc) {
        out.push("/* doc */");
        out.push(m.doc);
      }
      if (input.include_surrounding && m.parent_qualified_name) {
        out.push(`// inside ${m.parent_qualified_name}`);
      }
      const body = source.slice(m.byte_range[0], m.byte_range[1]);
      out.push("```");
      out.push(body);
      out.push("```");
      out.push("");
    }
  }
  return out.join("\n");
}
