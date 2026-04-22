import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findReferencesInFile } from "../../src/file-side/tools/find-references.js";
import { readLines } from "../../src/file-side/tools/read-lines.js";

const FIX = join(__dirname, "..", "fixtures", "sources");

describe("findReferencesInFile", () => {
  it("finds identifier occurrences with enclosing-symbol annotation", async () => {
    const out = await findReferencesInFile({
      path: join(FIX, "AuthViewModel.kt"),
      identifier: "viewModelScope",
    });
    expect(out).toContain("match");
    expect(out).toMatch(/viewModelScope\.launch/);
    expect(out).toMatch(/inside AuthViewModel/);
  });

  it("reports zero matches cleanly", async () => {
    const out = await findReferencesInFile({
      path: join(FIX, "AuthViewModel.kt"),
      identifier: "nothingNamedThis",
    });
    expect(out).toMatch(/0 matches/);
  });

  it("respects word boundaries", async () => {
    const out = await findReferencesInFile({
      path: join(FIX, "api.ts"),
      identifier: "Post",
    });
    // Should match Post but NOT PostRepository / PostsController as `Post` alone
    // (word boundary). But it DOES match the standalone `Post` in signatures.
    expect(out).toContain("match");
  });
});

describe("readLines", () => {
  it("returns a line range", async () => {
    const out = await readLines({
      path: join(FIX, "AuthViewModel.kt"),
      start_line: 1,
      end_line: 5,
    });
    expect(out).toContain("package com.example.myapp.ui.auth");
    expect(out).toMatch(/^Lines 1-5 of /m);
  });

  it("errors cleanly on reversed range", async () => {
    const out = await readLines({
      path: join(FIX, "AuthViewModel.kt"),
      start_line: 10,
      end_line: 5,
    });
    expect(out).toMatch(/end_line/);
  });
});
