import { estimateTokens } from "../tokens.js";
import type { ParsedFile, Symbol } from "../types.js";

export interface FormatOptions {
  focus?: string;
  maxTokens: number;
}

export interface FormattedResult {
  text: string;
  returnedTokens: number;
  focusedSymbols: Symbol[];
  mode: "outline" | "focused" | "full";
}

const MAX_OUTLINE_LINES = 80;

export function formatOutlineOnly(parsed: ParsedFile): FormattedResult {
  const lines = header(parsed, "outline only");
  lines.push("OUTLINE");
  lines.push("---------------------------------------------------------");
  renderTree(parsed.symbols, 0, lines, MAX_OUTLINE_LINES);
  lines.push("");
  lines.push(hints(parsed));
  const text = lines.join("\n");
  return {
    text,
    returnedTokens: estimateTokens(text),
    focusedSymbols: [],
    mode: "outline",
  };
}

export function formatWithFocus(
  parsed: ParsedFile,
  source: string,
  matches: Symbol[],
  opts: FormatOptions,
): FormattedResult {
  const focused: Symbol[] = [];
  const bodyChunks: string[] = [];
  const budget = Math.max(400, opts.maxTokens);
  let tokenAccum = 300; // reserve for outline + hints

  for (const sym of matches) {
    const bodyText = source.slice(sym.byte_range[0], sym.byte_range[1]);
    const bodyTokens = estimateTokens(bodyText);
    const half = Math.floor(budget / 2);
    if (bodyTokens > half) {
      // Oversized: emit structural outline instead of full body.
      const outlined = structuralOutline(sym, bodyText);
      tokenAccum += estimateTokens(outlined);
      bodyChunks.push(outlined);
      focused.push(sym);
      continue;
    }
    if (tokenAccum + bodyTokens > budget) break;
    tokenAccum += bodyTokens;
    bodyChunks.push(formatSymbolBody(sym, bodyText));
    focused.push(sym);
  }

  const lines = header(
    parsed,
    `outline + ${focused.length} focused ${focused.length === 1 ? "symbol" : "symbols"}`,
  );
  lines.push("OUTLINE");
  lines.push("---------------------------------------------------------");
  renderTree(parsed.symbols, 0, lines, MAX_OUTLINE_LINES, new Set(focused.map((s) => s.qualified_name)));
  lines.push("");
  if (bodyChunks.length > 0) {
    lines.push("FOCUSED SYMBOLS");
    lines.push("---------------------------------------------------------");
    for (const chunk of bodyChunks) {
      lines.push(chunk);
      lines.push("");
    }
  }
  lines.push(hints(parsed));

  const text = lines.join("\n");
  return {
    text,
    returnedTokens: estimateTokens(text),
    focusedSymbols: focused,
    mode: "focused",
  };
}

export function formatFull(parsed: ParsedFile, source: string): FormattedResult {
  const lines = header(parsed, "full content");
  lines.push("```");
  lines.push(source);
  lines.push("```");
  lines.push("");
  lines.push(hints(parsed));
  const text = lines.join("\n");
  return {
    text,
    returnedTokens: estimateTokens(text),
    focusedSymbols: [],
    mode: "full",
  };
}

// ---- helpers ----

function header(parsed: ParsedFile, mode: string): string[] {
  return [
    `File: ${parsed.path}`,
    `Language: ${parsed.language ?? "plain"} · ${parsed.line_count} lines · ~${parsed.token_estimate} tokens (full file)`,
    `file_id: ${parsed.file_id}`,
    `Returning: ${mode}`,
    "",
  ];
}

function hints(parsed: ParsedFile): string {
  return [
    "---",
    `[file_id="${parsed.file_id}"]`,
    "[Use list_symbols(path) to see every symbol, read_symbol(path, names[]) for specific bodies, read_lines(path,start,end) for ranges.]",
  ].join("\n");
}

function renderTree(
  symbols: Symbol[],
  depth: number,
  out: string[],
  budget: number,
  highlight?: Set<string>,
): number {
  let emitted = 0;
  for (const s of symbols) {
    if (out.length >= budget) {
      out.push("... (outline truncated; use list_symbols for full tree)");
      return emitted;
    }
    const indent = depth === 0 ? "" : `${"  ".repeat(depth - 1)}├─ `;
    const tag = s.modifiers.length ? `${s.modifiers.join(" ")} ` : "";
    const range = `[L${s.line_range[0]}-L${s.line_range[1]}]`;
    const marker = highlight?.has(s.qualified_name) ? "   ← focused" : "";
    out.push(`${indent}${tag}${kindLabel(s)} ${s.name} ${range}${marker}`);
    emitted++;
    if (s.children.length > 0) {
      emitted += renderTree(s.children, depth + 1, out, budget, highlight);
    }
  }
  return emitted;
}

function kindLabel(s: Symbol): string {
  switch (s.kind) {
    case "class":
      return "class";
    case "interface":
      return "interface";
    case "enum":
      return "enum";
    case "object":
      return "object";
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
    case "struct":
      return "struct";
    case "trait":
      return "trait";
  }
}

function formatSymbolBody(sym: Symbol, body: string): string {
  return [
    `${kindLabel(sym)} ${sym.qualified_name} [L${sym.line_range[0]}-L${sym.line_range[1]}]`,
    "```",
    body,
    "```",
  ].join("\n");
}

function structuralOutline(sym: Symbol, _body: string): string {
  const size = sym.line_range[1] - sym.line_range[0] + 1;
  const out: string[] = [
    `${kindLabel(sym)} ${sym.qualified_name} [L${sym.line_range[0]}-L${sym.line_range[1]}]`,
    "",
    `Body outline (${size} lines, too large to inline):`,
  ];
  if (sym.children.length > 0) {
    for (const c of sym.children) {
      out.push(`- [L${c.line_range[0]}-L${c.line_range[1]}] ${kindLabel(c)} ${c.name}`);
    }
  } else {
    out.push("- (no nested symbols; use read_lines to zoom in)");
  }
  out.push("");
  out.push("Use read_lines(path, start, end) to fetch a specific range.");
  return out.join("\n");
}
