import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { listSymbols } from "../../src/file-side/tools/list-symbols.js";
import { readSymbol } from "../../src/file-side/tools/read-symbol.js";

const FIX = join(__dirname, "..", "fixtures", "sources");

describe("listSymbols", () => {
  it("renders AuthViewModel.kt outline with expected entries", async () => {
    const out = await listSymbols({ path: join(FIX, "AuthViewModel.kt") });
    expect(out).toMatch(/class AuthViewModel/);
    expect(out).toMatch(/AuthViewModel\.login/);
    expect(out).toMatch(/AuthViewModel\.SessionTimer/);
    expect(out).toContain("file_id: kt_");
  });

  it("filters by kind", async () => {
    const out = await listSymbols({ path: join(FIX, "api.ts"), kinds: ["interface"] });
    expect(out).toMatch(/interface PostRepository/);
    expect(out).not.toMatch(/class PostsController/);
  });
});

describe("readSymbol", () => {
  it("returns body of dotted symbol", async () => {
    const out = await readSymbol({
      path: join(FIX, "AuthViewModel.kt"),
      names: ["AuthViewModel.login"],
    });
    expect(out).toContain("fun login(");
    expect(out).toContain("viewModelScope.launch");
    expect(out).toContain("AuthState.Loading");
    expect(out).toMatch(/method AuthViewModel\.login \[L\d+-L\d+\]/);
  });

  it("reports unknown symbols cleanly", async () => {
    const out = await readSymbol({
      path: join(FIX, "AuthViewModel.kt"),
      names: ["NotASymbol"],
    });
    expect(out).toMatch(/symbol not found: NotASymbol/);
  });

  it("returns multiple symbols in one call", async () => {
    const out = await readSymbol({
      path: join(FIX, "api.ts"),
      names: ["PostsController.list", "PostsController.create"],
    });
    expect(out).toContain("PostsController.list");
    expect(out).toContain("PostsController.create");
  });
});
