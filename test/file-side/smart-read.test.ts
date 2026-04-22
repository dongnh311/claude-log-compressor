import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { smartRead } from "../../src/file-side/tools/smart-read.js";

const FIX = join(__dirname, "..", "fixtures", "sources");

describe("smartRead on AuthViewModel.kt (large Kotlin fixture)", () => {
  it("defaults to outline (no focus) on a large file", async () => {
    const out = await smartRead({ path: join(FIX, "AuthViewModel.kt") });
    expect(out).toMatch(/OUTLINE/);
    expect(out).toContain("AuthViewModel");
    expect(out).not.toContain("viewModelScope.launch");
  });

  it("with focus='login' returns outline + focused body", async () => {
    const out = await smartRead({
      path: join(FIX, "AuthViewModel.kt"),
      focus: "login",
    });
    expect(out).toMatch(/FOCUSED SYMBOLS/);
    expect(out).toContain("fun login(");
    expect(out).toContain("viewModelScope.launch");
    expect(out).toMatch(/← focused/);
  });

  it("with focus regex matches multiple symbols", async () => {
    const out = await smartRead({
      path: join(FIX, "AuthViewModel.kt"),
      focus: "refresh|logout",
    });
    expect(out).toContain("refreshToken");
    expect(out).toContain("logout");
  });

  it("mode=full returns the whole file verbatim", async () => {
    const out = await smartRead({
      path: join(FIX, "AuthViewModel.kt"),
      mode: "full",
    });
    expect(out).toContain("package com.example.myapp.ui.auth");
    expect(out).toContain("viewModelScope.launch");
    expect(out).not.toContain("OUTLINE");
  });

  it("reduces token count vs full by ≥ 50% on outline mode", async () => {
    const full = await smartRead({ path: join(FIX, "AuthViewModel.kt"), mode: "full" });
    const outline = await smartRead({ path: join(FIX, "AuthViewModel.kt") });
    expect(outline.length).toBeLessThan(full.length * 0.5);
  });
});

describe("smartRead on small fixture", () => {
  it("returns full content for small files", async () => {
    const out = await smartRead({ path: join(FIX, "hello.kt") });
    expect(out).toContain("fun main()");
    expect(out).toContain("class Greeter");
    expect(out).not.toMatch(/OUTLINE/);
  });
});

describe("smartRead edge cases", () => {
  it("falls back to outline when focus matches nothing", async () => {
    const out = await smartRead({
      path: join(FIX, "AuthViewModel.kt"),
      focus: "doesNotExistAnywhere",
    });
    expect(out).toMatch(/matched no symbols/);
  });
});
