import { describe, expect, it } from "vitest";
import { estimateTokens } from "../../src/tokens.js";

describe("estimateTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("uses chars/4 ceiling", () => {
    expect(estimateTokens("a".repeat(16))).toBe(4);
    expect(estimateTokens("a".repeat(17))).toBe(5);
  });
});
