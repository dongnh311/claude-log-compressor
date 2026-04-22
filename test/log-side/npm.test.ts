import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { npmCompressor } from "../../src/log-side/compressors/npm.js";

const FIX = join(__dirname, "..", "fixtures", "logs");
const load = (name: string) => readFileSync(join(FIX, name), "utf8");

describe("npmCompressor.canHandle", () => {
  it("detects npm via command", () => {
    expect(
      npmCompressor.canHandle({ command: "npm install", cwd: "/", exitCode: 0, firstKb: "" }),
    ).toBe(true);
  });
});

describe("npmCompressor on success fixture", () => {
  const log = load("npm-install-success.log");
  const out = npmCompressor.compress(log, { maxTokens: 2000, logId: "npm_ok" });

  it("reports success summary", () => {
    expect(out.summary).toMatch(/npm OK/);
  });

  it("keeps the added-packages line", () => {
    expect(out.body).toMatch(/added 1284 packages/);
  });

  it("dedupes glob (2 occurrences) and rimraf (2 occurrences)", () => {
    expect(out.body).toMatch(/\[×2\].*glob/);
    expect(out.body).toMatch(/\[×2\].*rimraf/);
  });

  it("keeps audit summary", () => {
    expect(out.body).toMatch(/12 vulnerabilities/);
  });

  it("hits ≥50% reduction (bounded by # of unique deprecations in this small fixture)", () => {
    const reduction = 1 - out.compressedTokens / out.originalTokens;
    expect(reduction).toBeGreaterThanOrEqual(0.5);
  });
});

describe("npmCompressor on failure fixture", () => {
  const log = load("npm-install-fail.log");
  const out = npmCompressor.compress(log, { maxTokens: 2000, logId: "npm_fail" });

  it("reports FAILED with error code", () => {
    expect(out.summary).toMatch(/FAILED/);
    expect(out.summary).toMatch(/ERESOLVE/);
  });

  it("preserves ERESOLVE detail", () => {
    expect(out.body).toContain("Could not resolve dependency");
    expect(out.body).toMatch(/react@"\^17\.0\.0"/);
  });
});
