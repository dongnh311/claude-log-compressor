import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pytestCompressor } from "../src/log-side/compressors/pytest.js";

const FIX = join(__dirname, "fixtures");
const load = (name: string) => readFileSync(join(FIX, name), "utf8");

describe("pytestCompressor on passing fixture", () => {
  const log = load("pytest-passing.log");
  const out = pytestCompressor.compress(log, { maxTokens: 2000, logId: "pyt_ok" });

  it("reports 87 passed", () => {
    expect(out.summary).toMatch(/87\s+passed/);
  });

  it("drops the progress dot lines", () => {
    expect(out.body).not.toMatch(/\[\s*13%\]/);
  });

  it("hits ≥50% reduction", () => {
    const reduction = 1 - out.compressedTokens / out.originalTokens;
    expect(reduction).toBeGreaterThanOrEqual(0.5);
  });
});

describe("pytestCompressor on failing fixture", () => {
  const log = load("pytest-failing.log");
  const out = pytestCompressor.compress(log, { maxTokens: 2000, logId: "pyt_fail" });

  it("reports 2 failed + 1 error", () => {
    expect(out.summary).toMatch(/2 failed/);
    expect(out.summary).toMatch(/1 error/);
  });

  it("keeps ERRORS block", () => {
    expect(out.body).toContain("ConnectionError: could not connect to localhost:5432");
  });

  it("keeps FAILURES block with assertion details", () => {
    expect(out.body).toContain("test_user_create");
    expect(out.body).toContain("assert None is not None");
    expect(out.body).toContain("test_api_get");
    expect(out.body).toContain("assert 404 == 200");
  });

  it("keeps short summary with FAILED/ERROR locators", () => {
    expect(out.body).toContain("tests/test_users.py::test_user_create");
    expect(out.body).toContain("tests/test_api.py::test_api_get");
    expect(out.body).toContain("tests/test_utils.py::test_complex_util");
  });
});
