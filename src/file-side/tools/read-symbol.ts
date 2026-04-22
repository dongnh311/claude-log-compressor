import type { Symbol } from "../../types.js";
import { loadParsedFile } from "../file-cache.js";

export interface ReadSymbolInput {
  path: string;
  names: string[];
  include_surrounding?: boolean;
}

export async function readSymbol(input: ReadSymbolInput): Promise<string> {
  const { parsed, source } = await loadParsedFile(input.path);
  if (parsed.parse_status === "failed") {
    return `[error] could not parse ${input.path}: ${parsed.parse_errors.join("; ")}`;
  }

  const flat: Symbol[] = [];
  const walk = (list: Symbol[]): void => {
    for (const s of list) {
      flat.push(s);
      walk(s.children);
    }
  };
  walk(parsed.symbols);

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
      out.push(`${m.kind} ${m.qualified_name} [L${m.line_range[0]}-L${m.line_range[1]}]`);
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
