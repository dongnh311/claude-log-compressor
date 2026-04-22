import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { languageFromPath, type LanguageId } from "../../src/file-side/language-registry.js";
import { parseSource } from "../../src/file-side/parser.js";

const FIX = join(__dirname, "..", "fixtures", "sources");

const cases: Array<{ file: string; lang: LanguageId; mustContain: string[] }> = [
  { file: "hello.kt", lang: "kotlin", mustContain: ["class_declaration", "function_declaration"] },
  { file: "Hello.java", lang: "java", mustContain: ["class_declaration", "method_declaration"] },
  { file: "hello.ts", lang: "typescript", mustContain: ["class_declaration", "interface_declaration"] },
  { file: "hello.js", lang: "javascript", mustContain: ["class_declaration", "method_definition"] },
  { file: "hello.py", lang: "python", mustContain: ["class_definition", "function_definition"] },
  { file: "hello.go", lang: "go", mustContain: ["type_declaration", "function_declaration"] },
  { file: "hello.rs", lang: "rust", mustContain: ["struct_item", "function_item"] },
];

describe("languageFromPath", () => {
  it.each([
    [".kt", "kotlin"],
    [".tsx", "typescript"],
    [".jsx", "javascript"],
    [".py", "python"],
    [".rs", "rust"],
    [".md", null],
  ])("%s → %s", (ext, want) => {
    expect(languageFromPath(`/tmp/foo${ext}`)).toBe(want);
  });
});

describe("parseSource (tree-sitter smoke tests)", () => {
  for (const { file, lang, mustContain } of cases) {
    it(`parses ${file} via ${lang} grammar`, async () => {
      const source = readFileSync(join(FIX, file), "utf8");
      const tree = await parseSource(lang, source);
      expect(tree.rootNode).toBeTruthy();
      expect(tree.rootNode.hasError).toBe(false);

      const nodeTypes = new Set<string>();
      const walk = (node: { type: string; children: readonly unknown[] }): void => {
        nodeTypes.add(node.type);
        for (const c of node.children as Array<{ type: string; children: readonly unknown[] }>) {
          walk(c);
        }
      };
      walk(tree.rootNode);

      for (const expected of mustContain) {
        expect(nodeTypes.has(expected), `expected ${expected} in parse tree, got: ${[...nodeTypes].sort().join(", ")}`).toBe(true);
      }
    });
  }
});
