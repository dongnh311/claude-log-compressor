import type { ClassifierInput, CompressContext, CompressedResult, Compressor } from "../../types.js";
import { makeResult } from "../../utils.js";

const PLATFORM_RE = /^platform\s+/;
const FAILURES_HEADER_RE = /^=+\s*FAILURES\s*=+/;
const ERRORS_HEADER_RE = /^=+\s*ERRORS\s*=+/;
const SHORT_SUMMARY_RE = /^=+\s*short test summary info\s*=+/;
const FINAL_RESULT_RE = /^=+\s*(\d+\s+passed|\d+\s+failed|.*\d+\s+(passed|failed|error))/;
const SECTION_END_RE = /^=+\s*\S.*=+\s*$/;

type Section = "prelude" | "failures" | "errors" | "short_summary" | "tail";

export const pytestCompressor: Compressor = {
  name: "pytest",

  canHandle(input: ClassifierInput): boolean {
    if (/\bpytest\b/i.test(input.command)) return true;
    return /=+\s*test session starts\s*=+/.test(input.firstKb);
  },

  compress(fullLog: string, context: CompressContext): CompressedResult {
    const lines = fullLog.split("\n");

    let platform = "";
    const failuresBlock: string[] = [];
    const errorsBlock: string[] = [];
    const shortSummary: string[] = [];
    let finalLine = "";

    let section: Section = "prelude";

    for (const raw of lines) {
      const line = raw.replace(/\r$/, "");

      if (FAILURES_HEADER_RE.test(line)) {
        section = "failures";
        continue;
      }
      if (ERRORS_HEADER_RE.test(line)) {
        section = "errors";
        continue;
      }
      if (SHORT_SUMMARY_RE.test(line)) {
        section = "short_summary";
        continue;
      }
      if (FINAL_RESULT_RE.test(line) && /=+.*=+/.test(line)) {
        finalLine = line.replace(/=+/g, "").trim();
        section = "tail";
        continue;
      }
      if (
        section !== "prelude" &&
        SECTION_END_RE.test(line) &&
        !FAILURES_HEADER_RE.test(line) &&
        !ERRORS_HEADER_RE.test(line) &&
        !SHORT_SUMMARY_RE.test(line)
      ) {
        // Unknown section — stop capturing details.
        section = "tail";
        continue;
      }

      if (section === "prelude") {
        if (PLATFORM_RE.test(line) && !platform) platform = line;
        continue;
      }

      if (section === "failures") failuresBlock.push(line);
      else if (section === "errors") errorsBlock.push(line);
      else if (section === "short_summary") {
        if (line.trim().length > 0) shortSummary.push(line);
      }
    }

    const body = buildBody({ platform, errorsBlock, failuresBlock, shortSummary, finalLine });
    const summary = buildSummary(finalLine, shortSummary.length);

    return makeResult(summary, body, fullLog, context);
  },
};

function buildSummary(finalLine: string, failCount: number): string {
  if (finalLine) return `pytest: ${finalLine}`;
  if (failCount > 0) return `pytest: ${failCount} failure(s)`;
  return "pytest OK";
}

interface BuildBodyArgs {
  platform: string;
  errorsBlock: string[];
  failuresBlock: string[];
  shortSummary: string[];
  finalLine: string;
}

function buildBody(a: BuildBodyArgs): string {
  const out: string[] = [];
  if (a.platform) out.push(a.platform);
  if (a.finalLine) {
    if (out.length > 0) out.push("");
    out.push(a.finalLine);
  }

  if (a.errorsBlock.length > 0) {
    out.push("", "ERRORS:");
    out.push(...trimBlock(a.errorsBlock, 60));
  }

  if (a.failuresBlock.length > 0) {
    out.push("", "FAILURES:");
    out.push(...trimBlock(a.failuresBlock, 120));
  }

  if (a.shortSummary.length > 0) {
    out.push("", "Short summary:");
    for (const l of a.shortSummary.slice(0, 40)) out.push(`  ${l.trim()}`);
  }

  return out.join("\n");
}

function trimBlock(lines: string[], maxLines: number): string[] {
  // Drop leading/trailing blank lines, collapse >2 consecutive blanks.
  const trimmed: string[] = [];
  let prevBlank = false;
  for (const l of lines) {
    const blank = l.trim().length === 0;
    if (blank && prevBlank) continue;
    if (blank && trimmed.length === 0) continue;
    trimmed.push(l);
    prevBlank = blank;
  }
  while (trimmed.length > 0 && trimmed[trimmed.length - 1]?.trim() === "") trimmed.pop();

  if (trimmed.length <= maxLines) return trimmed;
  const head = trimmed.slice(0, Math.floor(maxLines * 0.6));
  const tail = trimmed.slice(trimmed.length - Math.floor(maxLines * 0.4));
  const dropped = trimmed.length - head.length - tail.length;
  return [...head, `… [${dropped} lines omitted] …`, ...tail];
}
