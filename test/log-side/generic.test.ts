import { describe, expect, it } from "vitest";
import { genericCompressor } from "../../src/log-side/compressors/generic.js";

describe("genericCompressor", () => {
  it("always claims canHandle as the fallback", () => {
    expect(
      genericCompressor.canHandle({ command: "anything", cwd: "/", exitCode: 0, firstKb: "" }),
    ).toBe(true);
  });

  it("preserves error-matching lines", () => {
    const log = Array(50)
      .fill("noise line that is harmless")
      .concat(["FATAL: database connection refused", "Error: cannot resolve symbol 'foo'"])
      .concat(Array(50).fill("more noise"))
      .join("\n");

    const out = genericCompressor.compress(log, { maxTokens: 500, logId: "test_1" });

    expect(out.body).toContain("FATAL: database connection refused");
    expect(out.body).toContain("Error: cannot resolve symbol 'foo'");
  });

  it("dedupes consecutive identical lines", () => {
    const log = ["header", ...Array(10).fill("same"), "footer"].join("\n");
    const out = genericCompressor.compress(log, { maxTokens: 2000, logId: "test_2" });
    expect(out.body).toMatch(/repeated 10×/);
  });

  it("reports fewer compressed tokens than original for large input", () => {
    const log = Array(2000).fill("line of repetitive content here").join("\n");
    const out = genericCompressor.compress(log, { maxTokens: 500, logId: "test_3" });
    expect(out.compressedTokens).toBeLessThan(out.originalTokens);
  });
});
