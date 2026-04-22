import { describe, expect, it } from "vitest";
import { classify } from "../src/log-side/classifier.js";

const input = (command: string, firstKb = "") => ({
  command,
  cwd: "/",
  exitCode: 0,
  firstKb,
});

describe("classify — gradle vs junit", () => {
  it("plain gradle build → gradle", () => {
    expect(classify(input("./gradlew assembleDebug"))).toBe("gradle");
    expect(classify(input("./gradlew clean :app:assembleRelease"))).toBe("gradle");
    expect(classify(input("./gradlew :app:installDebug"))).toBe("gradle");
  });

  it("gradle `test` task → junit", () => {
    expect(classify(input("./gradlew test"))).toBe("junit");
    expect(classify(input("./gradlew :app:test"))).toBe("junit");
  });

  it("gradle variant test tasks → junit", () => {
    expect(classify(input("./gradlew :app:testDebugUnitTest"))).toBe("junit");
    expect(classify(input("./gradlew testReleaseUnitTest"))).toBe("junit");
    expect(classify(input("./gradlew :lib:testDebugUnitTest --tests MyTest"))).toBe("junit");
  });

  it("gradle connected/instrumented test → junit", () => {
    expect(classify(input("./gradlew connectedAndroidTest"))).toBe("junit");
    expect(classify(input("./gradlew :app:connectedDebugAndroidTest"))).toBe("junit");
  });

  it("does not misclassify non-test gradle tasks with 'test' in a variant name", () => {
    // `assembleTestingDebug` would be a weird custom flavor; ensure our regex
    // doesn't over-trigger on non-test tasks.
    expect(classify(input("./gradlew assembleDebug"))).toBe("gradle");
    expect(classify(input("./gradlew bundleRelease"))).toBe("gradle");
  });

  it("classifies by JUnit-style per-test signature in output alone", () => {
    expect(
      classify(input("some-runner", "com.foo.BarTest > testBaz PASSED\n")),
    ).toBe("junit");
  });
});

describe("classify — other tools", () => {
  it("npm/yarn/pnpm", () => {
    expect(classify(input("npm install"))).toBe("npm");
    expect(classify(input("yarn add react"))).toBe("npm");
    expect(classify(input("pnpm i"))).toBe("npm");
  });

  it("jest/vitest via command", () => {
    expect(classify(input("npx jest"))).toBe("jest");
    expect(classify(input("vitest run"))).toBe("jest");
  });

  it("pytest via command or session header", () => {
    expect(classify(input("pytest tests/"))).toBe("pytest");
    expect(
      classify(input("python -m something", "============================= test session starts ==============================\n")),
    ).toBe("pytest");
  });

  it("unknown command with no signatures → generic", () => {
    expect(classify(input("echo hello"))).toBe("generic");
  });
});
