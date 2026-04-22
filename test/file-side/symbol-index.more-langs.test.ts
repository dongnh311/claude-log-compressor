import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LanguageId } from "../../src/file-side/language-registry.js";
import { parseSource } from "../../src/file-side/parser.js";
import { extractSymbols } from "../../src/file-side/symbol-index.js";

const FIX = join(__dirname, "..", "fixtures", "sources");

interface Case {
  file: string;
  lang: LanguageId;
  expect: string[];
}

const cases: Case[] = [
  { file: "Hello.java", lang: "java", expect: ["Hello", "Hello.greet", "Hello.main"] },
  { file: "hello.py", lang: "python", expect: ["Greeter", "Greeter.__init__", "Greeter.greet", "main"] },
  { file: "hello.go", lang: "go", expect: ["Greeter", "Greet", "main"] },
  { file: "hello.rs", lang: "rust", expect: ["Greeter", "main"] },
  { file: "hello.js", lang: "javascript", expect: ["HelloGreeter"] },
];

describe("symbol extraction across the remaining MVP languages", () => {
  for (const c of cases) {
    it(`extracts expected symbols from ${c.file}`, async () => {
      const source = readFileSync(join(FIX, c.file), "utf8");
      const tree = await parseSource(c.lang, source);
      const { symbols, parse_errors } = extractSymbols(c.lang, tree, source);
      expect(parse_errors).toEqual([]);

      const names = new Set<string>();
      const walk = (list: typeof symbols): void => {
        for (const s of list) {
          names.add(s.name);
          names.add(s.qualified_name);
          walk(s.children);
        }
      };
      walk(symbols);

      for (const e of c.expect) {
        expect(names.has(e), `expected ${e} in ${c.file}; got ${[...names].join(", ")}`).toBe(true);
      }
    });
  }
});
