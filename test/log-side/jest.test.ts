import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { jestCompressor } from "../../src/log-side/compressors/jest.js";

const FIX = join(__dirname, "..", "fixtures", "logs");
const load = (name: string) => readFileSync(join(FIX, name), "utf8");

describe("jestCompressor on passing fixture", () => {
  const log = load("jest-passing.log");
  const out = jestCompressor.compress(log, { maxTokens: 2000, logId: "jst_ok" });

  it("collapses passed suite names", () => {
    expect(out.body).not.toMatch(/PASS\s+src\//);
    expect(out.body).toMatch(/20 test suite\(s\) passed/);
  });

  it("keeps tests/suites/time summary", () => {
    expect(out.body).toMatch(/Tests:\s*147 passed, 147 total/);
    expect(out.body).toMatch(/Test Suites:\s*20 passed, 20 total/);
  });

  it("hits ≥70% reduction", () => {
    const reduction = 1 - out.compressedTokens / out.originalTokens;
    expect(reduction).toBeGreaterThanOrEqual(0.7);
  });
});

describe("jestCompressor on failing fixture", () => {
  const log = load("jest-failing.log");
  const out = jestCompressor.compress(log, { maxTokens: 2000, logId: "jst_fail" });

  it("reports failure count in summary", () => {
    expect(out.summary).toMatch(/3 failed/);
  });

  it("keeps each failed test title", () => {
    expect(out.body).toContain("Button › calls onClick when clicked");
    expect(out.body).toContain("Button › renders with correct label");
    expect(out.body).toContain("Dashboard › loads user data on mount");
  });

  it("preserves assertion details", () => {
    expect(out.body).toMatch(/Expected number of calls: 1/);
    expect(out.body).toMatch(/Unable to find an element with the text/);
  });

  it("drops passed suite names from top", () => {
    expect(out.body).not.toMatch(/PASS\s+src\/hooks/);
  });

  it("hits ≥30% reduction (failing logs are information-dense on this size)", () => {
    const reduction = 1 - out.compressedTokens / out.originalTokens;
    expect(reduction).toBeGreaterThanOrEqual(0.3);
  });
});
