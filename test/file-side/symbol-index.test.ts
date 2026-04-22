import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseSource } from "../../src/file-side/parser.js";
import { extractSymbols } from "../../src/file-side/symbol-index.js";

const FIX = join(__dirname, "..", "fixtures", "sources");

function flatten(symbols: Array<{ name: string; qualified_name: string; kind: string; children: unknown[] }>): Array<{ name: string; qualified_name: string; kind: string }> {
  const out: Array<{ name: string; qualified_name: string; kind: string }> = [];
  const walk = (list: typeof symbols) => {
    for (const s of list) {
      out.push({ name: s.name, qualified_name: s.qualified_name, kind: s.kind });
      walk(s.children as typeof symbols);
    }
  };
  walk(symbols);
  return out;
}

describe("extractSymbols on AuthViewModel.kt", () => {
  it("pulls top-level + nested symbols with correct kinds", async () => {
    const source = readFileSync(join(FIX, "AuthViewModel.kt"), "utf8");
    const tree = await parseSource("kotlin", source);
    const { symbols, parse_errors } = extractSymbols("kotlin", tree, source);
    expect(parse_errors).toEqual([]);
    const flat = flatten(symbols);
    const names = flat.map((s) => s.qualified_name);

    expect(names).toContain("AuthViewModel");
    expect(names).toContain("AuthViewModel.Companion");
    expect(names).toContain("AuthViewModel.login");
    expect(names).toContain("AuthViewModel.logout");
    expect(names).toContain("AuthViewModel.refreshToken");
    expect(names).toContain("AuthViewModel.validateCredentials");
    expect(names).toContain("AuthViewModel.SessionTimer");
    expect(names).toContain("AuthViewModel.SessionTimer.tick");

    expect(names).toContain("AuthState");
    expect(names).toContain("AnalyticsTracker");

    const login = flat.find((s) => s.qualified_name === "AuthViewModel.login");
    expect(login?.kind).toBe("method");
    const refresh = flat.find((s) => s.qualified_name === "AuthViewModel.refreshToken");
    expect(refresh?.kind).toBe("method");
  });

  it("captures signature without body for functions", async () => {
    const source = readFileSync(join(FIX, "AuthViewModel.kt"), "utf8");
    const tree = await parseSource("kotlin", source);
    const { symbols } = extractSymbols("kotlin", tree, source);
    const vm = symbols.find((s) => s.name === "AuthViewModel");
    const login = vm?.children.find((s) => s.name === "login");
    expect(login?.signature).toContain("fun login");
    expect(login?.signature).toContain("email: String");
    expect(login?.signature).toContain("password: String");
    expect(login?.signature).not.toContain("viewModelScope.launch");
  });
});

describe("extractSymbols on api.ts", () => {
  it("pulls interfaces, classes, methods, type alias, constants", async () => {
    const source = readFileSync(join(FIX, "api.ts"), "utf8");
    const tree = await parseSource("typescript", source);
    const { symbols, parse_errors } = extractSymbols("typescript", tree, source);
    expect(parse_errors).toEqual([]);
    const flat = flatten(symbols);
    const names = flat.map((s) => s.qualified_name);

    expect(names).toContain("PostRepository");
    expect(names).toContain("Post");
    expect(names).toContain("PostsController");
    expect(names).toContain("PostsController.list");
    expect(names).toContain("PostsController.get");
    expect(names).toContain("PostsController.create");
    expect(names).toContain("PostsController.notify");
    expect(names).toContain("PostsController.onCreate");
    expect(names).toContain("PostsListener");

    const list = flat.find((s) => s.qualified_name === "PostsController.list");
    expect(list?.kind).toBe("method");
    const iface = flat.find((s) => s.qualified_name === "PostRepository");
    expect(iface?.kind).toBe("interface");
  });
});
