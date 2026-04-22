import type { ClassifierInput, CompressContext, CompressedResult, Compressor } from "../../types.js";
import { makeResult } from "../../utils.js";
import { gradleCompressor } from "./gradle.js";

// Gradle test reporter format: `com.foo.BarTest > testBaz STATUS` (plain form).
const TEST_RESULT_RE = /^(\S+(?:\.\S+)+)\s+>\s+(.+?)\s+(PASSED|FAILED|SKIPPED)\s*$/;
const SUMMARY_RE = /^(\d+)\s+tests?\s+completed(?:,\s*(\d+)\s+failed)?(?:,\s*(\d+)\s+skipped)?/i;

// Framework/runtime prefixes to drop from stack traces.
const FRAMEWORK_PREFIXES = [
  "org.junit.",
  "org.testng.",
  "org.gradle.",
  "sun.reflect.",
  "java.lang.reflect.",
  "java.base/jdk.internal.",
  "java.base/java.lang.reflect.",
  "jdk.internal.",
  "kotlin.reflect.",
  "kotlinx.coroutines.internal.",
  "android.os.",
  "androidx.test.internal.",
];

interface Failure {
  fqcn: string;
  test: string;
  messageLines: string[];
  frames: string[];
}

export const junitCompressor: Compressor = {
  name: "junit",

  canHandle(input: ClassifierInput): boolean {
    if (/\bgradle(w)?\b/i.test(input.command) && /\btest/i.test(input.command)) return true;
    return /\b>\s+\S+\s+(PASSED|FAILED|SKIPPED)\b/m.test(input.firstKb);
  },

  compress(fullLog: string, context: CompressContext): CompressedResult {
    const lines = fullLog.split("\n");

    const failures: Failure[] = [];
    let passedCount = 0;
    let skippedCount = 0;
    let current: Failure | null = null;
    let summary = "";

    for (const raw of lines) {
      const line = raw.replace(/\r$/, "");
      const res = TEST_RESULT_RE.exec(line);
      if (res) {
        if (current) failures.push(current);
        current = null;
        const status = res[3];
        if (status === "PASSED") passedCount++;
        else if (status === "SKIPPED") skippedCount++;
        else if (status === "FAILED") {
          current = { fqcn: res[1] ?? "", test: res[2] ?? "", messageLines: [], frames: [] };
        }
        continue;
      }

      const sum = SUMMARY_RE.exec(line);
      if (sum) {
        summary = line.trim();
        if (current) {
          failures.push(current);
          current = null;
        }
        continue;
      }

      if (current) {
        const trimmed = line.trim();
        if (!trimmed) {
          failures.push(current);
          current = null;
          continue;
        }
        if (isFrame(trimmed)) {
          if (!isFrameworkFrame(trimmed)) current.frames.push(trimmed);
        } else {
          current.messageLines.push(trimmed);
        }
      }
    }
    if (current) failures.push(current);

    // If the gradle test task was UP-TO-DATE (cached), there's no per-test
    // output at all. Fall back to the gradle compressor so Claude still sees
    // BUILD SUCCESSFUL/FAILED + duration + any warnings emitted during config.
    if (!summary && failures.length === 0 && passedCount === 0 && skippedCount === 0) {
      return gradleCompressor.compress(fullLog, context);
    }

    const body = buildBody({ summary, failures, passedCount, skippedCount });
    const summaryLine = buildSummary(summary, failures.length, passedCount, skippedCount);

    return makeResult(summaryLine, body, fullLog, context);
  },
};

function isFrame(s: string): boolean {
  return s.startsWith("at ");
}

function isFrameworkFrame(s: string): boolean {
  const payload = s.replace(/^at\s+/, "");
  return FRAMEWORK_PREFIXES.some((p) => payload.startsWith(p));
}

function buildSummary(
  summary: string,
  failCount: number,
  passed: number,
  skipped: number,
): string {
  if (summary) return `junit: ${summary}`;
  if (failCount > 0) return `junit: ${failCount} failed, ${passed} passed`;
  if (passed > 0) return `junit: ${passed} passed${skipped > 0 ? `, ${skipped} skipped` : ""}`;
  return "junit: (no tests detected)";
}

interface BuildBodyArgs {
  summary: string;
  failures: Failure[];
  passedCount: number;
  skippedCount: number;
}

function buildBody(a: BuildBodyArgs): string {
  const out: string[] = [];
  if (a.summary) out.push(a.summary);

  if (a.failures.length > 0) {
    out.push("", `Failed tests (${a.failures.length}):`);
    for (const f of a.failures) {
      out.push("", `  ✗ ${f.fqcn} > ${f.test}`);
      for (const m of f.messageLines.slice(0, 4)) out.push(`    ${m}`);
      const shownFrames = f.frames.slice(0, 5);
      for (const fr of shownFrames) out.push(`    ${fr}`);
      if (f.frames.length > shownFrames.length) {
        out.push(`    … ${f.frames.length - shownFrames.length} more app frames omitted`);
      }
    }
  }

  if (a.passedCount > 0 || a.skippedCount > 0) {
    const bits = [`${a.passedCount} passed`];
    if (a.skippedCount > 0) bits.push(`${a.skippedCount} skipped`);
    out.push("", `(${bits.join(", ")} — names collapsed)`);
  }

  return out.join("\n");
}
