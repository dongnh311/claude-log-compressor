import type { ClassifierInput, CompressContext, CompressedResult, Compressor } from "../../types.js";
import { makeResult } from "../../utils.js";

const PASS_RE = /^PASS\s+(\S+)/;
const FAIL_RE = /^FAIL\s+(\S+)/;
const FAIL_TEST_MARKER_RE = /^\s*●\s+(.+)$/;
const SUITE_COUNT_RE = /^Test Suites:\s*(.*)$/;
const TESTS_COUNT_RE = /^Tests:\s*(.*)$/;
const TIME_RE = /^Time:\s*(.*)$/;
const SUMMARY_HEADER_RE = /^Summary of all failing tests\b/;

interface FailureBlock {
  suite: string;
  title: string;
  details: string[];
}

export const jestCompressor: Compressor = {
  name: "jest",

  canHandle(input: ClassifierInput): boolean {
    if (/\b(jest|vitest)\b/i.test(input.command)) return true;
    return /^(PASS|FAIL)\s+/m.test(input.firstKb) && /Test Suites:|Tests:/.test(input.firstKb);
  },

  compress(fullLog: string, context: CompressContext): CompressedResult {
    const lines = fullLog.split("\n");

    let passedSuites = 0;
    const failedSuites: string[] = [];
    const failures: FailureBlock[] = [];
    let testsLine = "";
    let suitesLine = "";
    let timeLine = "";
    let inSummary = false;

    let current: FailureBlock | null = null;
    let currentSuite = "";
    let inFailSuite = false;

    for (const raw of lines) {
      const line = raw.replace(/\r$/, "");

      if (SUMMARY_HEADER_RE.test(line)) {
        inSummary = true;
        if (current) {
          failures.push(current);
          current = null;
        }
        continue;
      }

      const suiteCount = SUITE_COUNT_RE.exec(line);
      if (suiteCount) {
        suitesLine = (suiteCount[1] ?? "").trim();
        continue;
      }
      const testsCount = TESTS_COUNT_RE.exec(line);
      if (testsCount) {
        testsLine = (testsCount[1] ?? "").trim();
        continue;
      }
      const timeMatch = TIME_RE.exec(line);
      if (timeMatch) {
        timeLine = (timeMatch[1] ?? "").trim();
        continue;
      }

      const pass = PASS_RE.exec(line);
      if (pass) {
        passedSuites++;
        if (current) {
          failures.push(current);
          current = null;
        }
        inFailSuite = false;
        continue;
      }

      const fail = FAIL_RE.exec(line);
      if (fail) {
        failedSuites.push(fail[1] ?? "");
        currentSuite = fail[1] ?? "";
        if (current) {
          failures.push(current);
          current = null;
        }
        inFailSuite = true;
        continue;
      }

      if (inSummary) continue;

      if (!inFailSuite) continue;

      const marker = FAIL_TEST_MARKER_RE.exec(line);
      if (marker) {
        if (current) failures.push(current);
        current = { suite: currentSuite, title: (marker[1] ?? "").trim(), details: [] };
        continue;
      }

      if (current && line.trim().length > 0) {
        current.details.push(line);
      }
    }

    if (current) failures.push(current);

    const body = buildBody({
      suitesLine,
      testsLine,
      timeLine,
      failures,
      failedSuites,
      passedSuites,
    });
    const summary = buildSummary(testsLine, suitesLine, failures.length);

    return makeResult(summary, body, fullLog, context);
  },
};

function buildSummary(tests: string, suites: string, failureCount: number): string {
  if (tests) return `Tests: ${tests}${suites ? ` | Suites: ${suites}` : ""}`;
  if (failureCount > 0) return `${failureCount} test failure(s)`;
  return "Tests OK";
}

interface BuildBodyArgs {
  suitesLine: string;
  testsLine: string;
  timeLine: string;
  failures: FailureBlock[];
  failedSuites: string[];
  passedSuites: number;
}

function buildBody(a: BuildBodyArgs): string {
  const out: string[] = [];
  if (a.suitesLine) out.push(`Test Suites: ${a.suitesLine}`);
  if (a.testsLine) out.push(`Tests: ${a.testsLine}`);
  if (a.timeLine) out.push(`Time: ${a.timeLine}`);

  if (a.failures.length > 0) {
    out.push("", `Failed tests (${a.failures.length}):`);
    for (const f of a.failures) {
      out.push("", `  ✗ ${f.suite}`);
      out.push(`    ● ${f.title}`);
      for (const d of trimDetails(f.details)) out.push(`    ${d}`);
    }
  }

  if (a.passedSuites > 0) {
    out.push("", `(${a.passedSuites} test suite(s) passed — names collapsed)`);
  }

  return out.join("\n");
}

function trimDetails(details: string[]): string[] {
  // Drop leading blanks, collapse >3 consecutive blanks into 1, cap at 20 lines.
  const out: string[] = [];
  let lastBlank = false;
  for (const line of details) {
    const blank = line.trim().length === 0;
    if (blank && lastBlank) continue;
    if (blank && out.length === 0) continue;
    out.push(line);
    lastBlank = blank;
    if (out.length >= 20) {
      out.push("    … (truncated)");
      break;
    }
  }
  return out;
}
