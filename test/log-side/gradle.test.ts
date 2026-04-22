import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gradleCompressor } from "../../src/log-side/compressors/gradle.js";

const FIX = join(__dirname, "..", "fixtures", "logs");
const loadFixture = (name: string) => readFileSync(join(FIX, name), "utf8");

describe("gradleCompressor.canHandle", () => {
  it("detects gradle via command", () => {
    expect(
      gradleCompressor.canHandle({
        command: "./gradlew assembleDebug",
        cwd: "/",
        exitCode: 0,
        firstKb: "",
      }),
    ).toBe(true);
  });

  it("detects gradle via BUILD line even without command hint", () => {
    expect(
      gradleCompressor.canHandle({
        command: "something",
        cwd: "/",
        exitCode: 0,
        firstKb: "... BUILD FAILED ...",
      }),
    ).toBe(true);
  });
});

describe("gradleCompressor on success fixture", () => {
  const log = loadFixture("gradle-success.log");
  const out = gradleCompressor.compress(log, { maxTokens: 2000, logId: "grd_test_ok" });

  it("reports BUILD SUCCESSFUL with zero errors", () => {
    expect(out.summary).toMatch(/BUILD SUCCESSFUL/);
    expect(out.summary).toMatch(/0 errors/);
  });

  it("captures duration", () => {
    expect(out.body).toMatch(/Duration: 23s/);
  });

  it("dedupes the deprecation warning (3 occurrences → 1 unique with ×3)", () => {
    expect(out.body).toMatch(/\[×3\].*setBackgroundDrawable/);
  });

  it("hits ≥80% token reduction", () => {
    const reduction = 1 - out.compressedTokens / out.originalTokens;
    expect(reduction).toBeGreaterThanOrEqual(0.8);
  });
});

describe("gradleCompressor on failure fixture", () => {
  const log = loadFixture("gradle-failure.log");
  const out = gradleCompressor.compress(log, { maxTokens: 2000, logId: "grd_test_fail" });

  it("reports BUILD FAILED with 3 errors", () => {
    expect(out.summary).toMatch(/BUILD FAILED/);
    expect(out.summary).toMatch(/3 errors/);
  });

  it("preserves ALL error messages with file:line", () => {
    expect(out.body).toContain("MainActivity.kt:128");
    expect(out.body).toContain("Unresolved reference: viewBinding");
    expect(out.body).toContain("MainActivity.kt:145");
    expect(out.body).toContain("Type mismatch: inferred type is Int? but String was expected");
    expect(out.body).toContain("UserRepository.kt:67");
    expect(out.body).toContain("Unresolved reference: legacyMapper");
  });

  it("names the failing task", () => {
    expect(out.body).toMatch(/Failed task:\s*:app:compileDebugKotlin/);
  });

  it("includes what-went-wrong block", () => {
    expect(out.body).toMatch(/What went wrong:/);
    expect(out.body).toContain("Execution failed for task ':app:compileDebugKotlin'");
  });

  it("hits ≥80% token reduction", () => {
    const reduction = 1 - out.compressedTokens / out.originalTokens;
    expect(reduction).toBeGreaterThanOrEqual(0.8);
  });
});
