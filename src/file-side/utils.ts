import type { ParsedFile, Symbol, SymbolKind } from "../types.js";
import { loadParsedFile } from "./file-cache.js";

export const KIND_LABELS: Record<SymbolKind, string> = {
  class: "class",
  interface: "interface",
  enum: "enum",
  object: "object",
  struct: "struct",
  trait: "trait",
  function: "fun",
  method: "method",
  constructor: "constructor",
  property: "property",
  field: "field",
  const: "const",
  type_alias: "type",
  namespace: "namespace",
  module: "module",
};

export function kindLabel(kind: SymbolKind): string {
  return KIND_LABELS[kind];
}

export function formatLineRange(start: number, end: number): string {
  return `[L${start}-L${end}]`;
}

export function flattenSymbolTree(symbols: Symbol[]): Symbol[] {
  const out: Symbol[] = [];
  const walk = (list: Symbol[]): void => {
    for (const s of list) {
      out.push(s);
      walk(s.children);
    }
  };
  walk(symbols);
  return out;
}

export type LoadOk = { parsed: ParsedFile; source: string };
export type LoadErr = { error: string };

export async function loadAndGuard(path: string): Promise<LoadOk | LoadErr> {
  const result = await loadParsedFile(path);
  if (result.parsed.parse_status === "failed") {
    return {
      error: `[error] could not parse ${path}: ${result.parsed.parse_errors.join("; ")}`,
    };
  }
  return result;
}
