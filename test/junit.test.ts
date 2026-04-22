import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { junitCompressor } from "../src/log-side/compressors/junit.js";

const FIX = join(__dirname, "fixtures");
const load = (name: string) => readFileSync(join(FIX, name), "utf8");

describe("junitCompressor on failing fixture", () => {
  const log = load("junit-failing.log");
  const out = junitCompressor.compress(log, { maxTokens: 2000, logId: "jun_fail" });

  it("reports summary line", () => {
    expect(out.summary).toMatch(/27 tests? completed/);
    expect(out.summary).toMatch(/2 failed/);
  });

  it("keeps all failed test names with FQCN", () => {
    expect(out.body).toContain("com.example.myapp.AuthServiceTest > testRefreshToken");
    expect(out.body).toContain("com.example.myapp.PostRepositoryTest > testPostDelete");
  });

  it("preserves assertion messages", () => {
    expect(out.body).toContain("Expected token to be refreshed but was null");
    expect(out.body).toContain("NullPointerException");
  });

  it("keeps app frames", () => {
    expect(out.body).toContain("AuthServiceTest.testRefreshToken(AuthServiceTest.kt:87)");
    expect(out.body).toContain("PostRepository.delete(PostRepository.kt:45)");
  });

  it("drops org.junit framework frames", () => {
    expect(out.body).not.toContain("org.junit.Assert.fail");
    expect(out.body).not.toContain("org.junit.runners.model.FrameworkMethod");
  });

  it("drops reflection frames", () => {
    expect(out.body).not.toContain("java.base/java.lang.reflect.Method");
    expect(out.body).not.toContain("jdk.internal.reflect");
  });

  it("collapses passing-test names to a count", () => {
    expect(out.body).toMatch(/\d+ passed.*names collapsed/);
    expect(out.body).not.toContain("testUserCreate");
    expect(out.body).not.toContain("testLoginValidCredentials");
  });

  it("hits ≥70% reduction", () => {
    const reduction = 1 - out.compressedTokens / out.originalTokens;
    expect(reduction).toBeGreaterThanOrEqual(0.7);
  });
});
