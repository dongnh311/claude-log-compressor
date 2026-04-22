import type { Symbol, SymbolKind } from "../types.js";
import type { LanguageId } from "./language-registry.js";
import type { SyntaxNode, Tree } from "./parser.js";

const NODE_MAP_KOTLIN: Record<string, SymbolKind> = {
  class_declaration: "class",
  object_declaration: "object",
  companion_object: "object",
  interface_declaration: "interface",
  enum_class_body: "enum",
  function_declaration: "function",
  property_declaration: "property",
  type_alias: "type_alias",
  class_parameter: "property",
};

const NODE_MAP_TS: Record<string, SymbolKind> = {
  class_declaration: "class",
  abstract_class_declaration: "class",
  interface_declaration: "interface",
  type_alias_declaration: "type_alias",
  enum_declaration: "enum",
  function_declaration: "function",
  method_definition: "method",
  method_signature: "method",
  public_field_definition: "field",
  property_signature: "field",
  abstract_method_signature: "method",
  lexical_declaration: "const",
};

type NodeMap = Record<string, SymbolKind>;

interface WalkContext {
  source: string;
  parentPath: string | null;
  parentChildren: Symbol[];
  nodeMap: NodeMap;
  lang: LanguageId;
}

export function extractSymbols(
  lang: LanguageId,
  tree: Tree,
  source: string,
): { symbols: Symbol[]; parse_errors: string[] } {
  const root = tree.rootNode;
  const symbols: Symbol[] = [];
  const errors: string[] = [];

  const nodeMap =
    lang === "kotlin"
      ? NODE_MAP_KOTLIN
      : lang === "typescript" || lang === "javascript"
        ? NODE_MAP_TS
        : {};

  if (Object.keys(nodeMap).length === 0) {
    return { symbols, parse_errors: [`no symbol extractor for ${lang}`] };
  }

  walkNode(root, {
    source,
    parentPath: null,
    parentChildren: symbols,
    nodeMap,
    lang,
  });

  collectErrors(root, errors);
  return { symbols, parse_errors: errors };
}

function walkNode(node: SyntaxNode, ctx: WalkContext): void {
  const kind = ctx.nodeMap[node.type];
  if (kind) {
    const sym = buildSymbol(node, kind, ctx);
    if (sym) {
      ctx.parentChildren.push(sym);
      // Recurse into body to find nested symbols.
      const subCtx: WalkContext = {
        ...ctx,
        parentPath: sym.qualified_name,
        parentChildren: sym.children,
      };
      for (const child of node.children) {
        walkNode(child, subCtx);
      }
      return;
    }
  }
  for (const child of node.children) {
    walkNode(child, ctx);
  }
}

function buildSymbol(node: SyntaxNode, kind: SymbolKind, ctx: WalkContext): Symbol | null {
  const name = extractName(node, ctx);
  if (!name) return null;
  const modifiers = extractModifiers(node);
  const signature = extractSignature(node, ctx.source, name);
  const doc = extractDoc(node, ctx.source);

  // Normalize kind: if we're inside a class, a "function" becomes "method".
  let resolvedKind: SymbolKind = kind;
  if (ctx.parentPath && resolvedKind === "function") resolvedKind = "method";
  if (ctx.parentPath && resolvedKind === "property") resolvedKind = "field";

  const qualified = ctx.parentPath ? `${ctx.parentPath}.${name}` : name;

  return {
    name,
    qualified_name: qualified,
    kind: resolvedKind,
    signature,
    modifiers,
    doc,
    line_range: [node.startPosition.row + 1, node.endPosition.row + 1],
    byte_range: [node.startIndex, node.endIndex],
    children: [],
    parent_qualified_name: ctx.parentPath,
  };
}

function extractName(node: SyntaxNode, ctx: WalkContext): string | null {
  // Kotlin companion_object: anonymous → use literal name
  if (ctx.lang === "kotlin" && node.type === "companion_object") return "Companion";

  // Kotlin variable_declaration inside property_declaration
  if (node.type === "property_declaration") {
    const vd = findFirstChild(node, ["variable_declaration"]);
    if (vd) {
      const id = findFirstChild(vd, ["simple_identifier"]);
      if (id) return textOf(id, ctx.source);
    }
  }

  // Kotlin lexical_declaration equivalent
  if (node.type === "lexical_declaration") {
    const vd = findFirstChild(node, ["variable_declarator"]);
    if (vd) {
      const id = findFirstChild(vd, ["identifier", "property_identifier"]);
      if (id) return textOf(id, ctx.source);
    }
    return null;
  }

  // Class/interface/enum/func/method/etc: named child 'name' if present, else
  // first simple_identifier / property_identifier / type_identifier child.
  const named = node.childForFieldName?.("name");
  if (named) return textOf(named, ctx.source);

  const idNode = findFirstChild(node, [
    "simple_identifier",
    "identifier",
    "property_identifier",
    "type_identifier",
  ]);
  if (idNode) return textOf(idNode, ctx.source);

  return null;
}

function extractModifiers(node: SyntaxNode): string[] {
  const mods: string[] = [];
  const modNode = findFirstChild(node, ["modifiers", "modifier_list"]);
  if (modNode) {
    for (const child of modNode.children) {
      const t = child.type;
      // Tree-sitter returns modifier leaves as node types like
      // "visibility_modifier", "function_modifier", "member_modifier",
      // "inheritance_modifier", "declaration_kind". Their text is the keyword.
      if (
        t.endsWith("_modifier") ||
        t === "async" ||
        t === "static" ||
        t === "export" ||
        t === "declare" ||
        t === "readonly" ||
        t === "abstract" ||
        t === "accessibility_modifier" ||
        t === "override_modifier"
      ) {
        // Skip; we'll read the leaf below.
      }
      const text = (child as unknown as { text?: string }).text;
      if (typeof text === "string") {
        const kw = text.trim();
        if (kw && kw.length < 20 && /^[a-z]+$/i.test(kw)) mods.push(kw);
      }
    }
  }
  // TS export/async keywords may appear as direct siblings before the decl.
  if (node.previousSibling) {
    let sib: SyntaxNode | null = node.previousSibling;
    while (sib) {
      const t = sib.type;
      if (t === "export" || t === "async" || t === "default") {
        mods.unshift(t);
      } else if (sib.isNamed) {
        break;
      }
      sib = sib.previousSibling;
    }
  }
  return Array.from(new Set(mods));
}

function extractSignature(node: SyntaxNode, source: string, name: string): string {
  // For function/method nodes, slice from start to body opening brace so the
  // signature doesn't include the body. For declarations with no body,
  // slice the full node.
  const bodyStart = findBodyStart(node);
  const sigEnd = bodyStart !== -1 ? bodyStart : node.endIndex;
  const sigText = source.slice(node.startIndex, sigEnd).trim();
  // Compact whitespace
  const compact = sigText.replace(/\s+/g, " ").replace(/\s*{\s*$/, "").trim();
  return compact || name;
}

function extractDoc(node: SyntaxNode, source: string): string | null {
  // Look at the previous sibling — if it's a comment immediately preceding the node, capture it.
  let prev = node.previousSibling;
  while (prev && !prev.isNamed) prev = prev.previousSibling;
  if (!prev) return null;
  if (prev.type !== "comment" && prev.type !== "multiline_comment") return null;
  // Must be adjacent (no more than 2 blank lines between).
  if (node.startPosition.row - prev.endPosition.row > 2) return null;
  return source.slice(prev.startIndex, prev.endIndex).trim();
}

function findFirstChild(node: SyntaxNode, types: string[]): SyntaxNode | null {
  for (const child of node.children) {
    if (types.includes(child.type)) return child;
  }
  return null;
}

function findBodyStart(node: SyntaxNode): number {
  for (const child of node.children) {
    if (
      child.type === "function_body" ||
      child.type === "class_body" ||
      child.type === "object_body" ||
      child.type === "enum_body" ||
      child.type === "statement_block" ||
      child.type === "block" ||
      child.type === "interface_body"
    ) {
      return child.startIndex;
    }
  }
  return -1;
}

function textOf(node: SyntaxNode, source: string): string {
  return source.slice(node.startIndex, node.endIndex);
}

function collectErrors(node: SyntaxNode, out: string[]): void {
  if (node.type === "ERROR" || node.isMissing) {
    out.push(`${node.type} at line ${node.startPosition.row + 1}`);
  }
  for (const child of node.children) {
    collectErrors(child, out);
  }
}
