import { estimateTokens } from "../tokens.js";
import type { ClassifierInput, CompressContext, CompressedResult, Compressor } from "../types.js";

// Kotlin/javac-style: `e: file:///path/to/File.kt:LINE:COL MESSAGE` or
// `e: /path/File.kt:LINE:COL MESSAGE`. Also matches `w:` for warnings.
const KOTLIN_DIAG_RE = /^([ew]):\s*(?:file:\/\/)?([^\s:]+):(\d+)(?::(\d+))?\s+(.*)$/;

// javac-style: `/path/Foo.java:42: error: message`
const JAVAC_ERROR_RE = /^(.+?\.java):(\d+):\s*(error|warning):\s*(.*)$/;

// Task status: `> Task :app:compileDebugKotlin FAILED` or ` SUCCESS / UP-TO-DATE / NO-SOURCE`
const TASK_STATUS_RE = /^>\s*Task\s+(\S+)(?:\s+(FAILED|UP-TO-DATE|NO-SOURCE|SKIPPED))?\s*$/;

const BUILD_RESULT_RE = /^BUILD (SUCCESSFUL|FAILED)(?:\s+in\s+(\S+))?/;
const FAILURE_HEADER_RE = /^FAILURE:\s*(.*)$/;
const WHAT_WENT_WRONG_RE = /^\*\s*What went wrong:\s*$/;
const TRY_HEADER_RE = /^\*\s*Try:\s*$/;

interface Diagnostic {
  severity: "error" | "warning";
  file: string;
  line: number;
  col?: number;
  message: string;
}

export const gradleCompressor: Compressor = {
  name: "gradle",

  canHandle(input: ClassifierInput): boolean {
    if (/\b(gradle|gradlew)\b/i.test(input.command)) return true;
    return /BUILD (SUCCESSFUL|FAILED)/.test(input.firstKb);
  },

  compress(fullLog: string, context: CompressContext): CompressedResult {
    const lines = fullLog.split("\n");

    const errors: Diagnostic[] = [];
    const warnings: Diagnostic[] = [];
    const failedTasks: string[] = [];
    const whatWentWrong: string[] = [];
    let buildStatus: "SUCCESSFUL" | "FAILED" | "UNKNOWN" = "UNKNOWN";
    let buildDuration: string | undefined;

    let inWhatWentWrong = false;

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();

      const build = BUILD_RESULT_RE.exec(line);
      if (build) {
        buildStatus = build[1] as "SUCCESSFUL" | "FAILED";
        buildDuration = build[2];
        inWhatWentWrong = false;
        continue;
      }

      if (FAILURE_HEADER_RE.test(line)) {
        inWhatWentWrong = false;
        continue;
      }
      if (WHAT_WENT_WRONG_RE.test(line)) {
        inWhatWentWrong = true;
        continue;
      }
      if (TRY_HEADER_RE.test(line)) {
        inWhatWentWrong = false;
        continue;
      }
      if (inWhatWentWrong) {
        if (line.trim().length > 0) whatWentWrong.push(line.trim());
        continue;
      }

      const task = TASK_STATUS_RE.exec(line);
      if (task && task[2] === "FAILED") {
        failedTasks.push(task[1] ?? "");
        continue;
      }

      const kotlin = KOTLIN_DIAG_RE.exec(line);
      if (kotlin) {
        const diag: Diagnostic = {
          severity: kotlin[1] === "e" ? "error" : "warning",
          file: basename(kotlin[2] ?? ""),
          line: Number.parseInt(kotlin[3] ?? "0", 10),
          col: kotlin[4] ? Number.parseInt(kotlin[4], 10) : undefined,
          message: (kotlin[5] ?? "").trim(),
        };
        (diag.severity === "error" ? errors : warnings).push(diag);
        continue;
      }

      const javac = JAVAC_ERROR_RE.exec(line);
      if (javac) {
        const diag: Diagnostic = {
          severity: javac[3] === "error" ? "error" : "warning",
          file: basename(javac[1] ?? ""),
          line: Number.parseInt(javac[2] ?? "0", 10),
          message: (javac[4] ?? "").trim(),
        };
        (diag.severity === "error" ? errors : warnings).push(diag);
        continue;
      }
    }

    const dedupedWarnings = dedupeByMessage(warnings);
    const summary = buildSummary(buildStatus, errors.length, dedupedWarnings.totalUnique);
    const body = buildBody({
      status: buildStatus,
      duration: buildDuration,
      errors,
      dedupedWarnings,
      failedTasks,
      whatWentWrong,
      maxTokens: context.maxTokens,
    });

    return {
      summary,
      body,
      originalTokens: estimateTokens(fullLog),
      compressedTokens: estimateTokens(body),
      logId: context.logId,
      truncatedSections: [],
    };
  },
};

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i >= 0 ? path.slice(i + 1) : path;
}

interface DedupedWarnings {
  totalUnique: number;
  totalOccurrences: number;
  groups: { message: string; count: number; sample: Diagnostic }[];
}

function dedupeByMessage(diags: Diagnostic[]): DedupedWarnings {
  const map = new Map<string, { count: number; sample: Diagnostic }>();
  for (const d of diags) {
    const key = d.message;
    const existing = map.get(key);
    if (existing) existing.count++;
    else map.set(key, { count: 1, sample: d });
  }
  const groups = Array.from(map.entries())
    .map(([message, v]) => ({ message, count: v.count, sample: v.sample }))
    .sort((a, b) => b.count - a.count);
  return {
    totalUnique: groups.length,
    totalOccurrences: diags.length,
    groups,
  };
}

function buildSummary(
  status: "SUCCESSFUL" | "FAILED" | "UNKNOWN",
  errorCount: number,
  warningCount: number,
): string {
  const head =
    status === "SUCCESSFUL"
      ? "BUILD SUCCESSFUL"
      : status === "FAILED"
        ? "BUILD FAILED"
        : "BUILD (status unknown)";
  const errs = errorCount === 1 ? "1 error" : `${errorCount} errors`;
  const warns = warningCount === 1 ? "1 warning" : `${warningCount} warnings`;
  return `${head} (${errs}, ${warns})`;
}

interface BuildBodyArgs {
  status: "SUCCESSFUL" | "FAILED" | "UNKNOWN";
  duration: string | undefined;
  errors: Diagnostic[];
  dedupedWarnings: DedupedWarnings;
  failedTasks: string[];
  whatWentWrong: string[];
  maxTokens: number;
}

function buildBody(a: BuildBodyArgs): string {
  const out: string[] = [];

  if (a.duration) out.push(`Duration: ${a.duration}`);

  if (a.errors.length > 0) {
    out.push("", "Errors:");
    for (const e of a.errors) {
      const loc = e.col !== undefined ? `${e.file}:${e.line}:${e.col}` : `${e.file}:${e.line}`;
      out.push(`  ${loc} — ${e.message}`);
    }
  }

  if (a.dedupedWarnings.groups.length > 0) {
    const { totalUnique, totalOccurrences, groups } = a.dedupedWarnings;
    const shown = groups.slice(0, 10);
    const header =
      totalUnique === totalOccurrences
        ? `Warnings (${totalUnique} unique):`
        : `Warnings (${totalUnique} unique, collapsed from ${totalOccurrences} occurrences${
            shown.length < groups.length ? `, showing top ${shown.length}` : ""
          }):`;
    out.push("", header);
    for (const g of shown) {
      const prefix = g.count > 1 ? `[×${g.count}] ` : "";
      out.push(`  ${prefix}${g.message}`);
    }
    if (shown.length < groups.length) {
      out.push(`  … ${groups.length - shown.length} more unique warnings omitted`);
    }
  }

  if (a.whatWentWrong.length > 0 && a.status === "FAILED") {
    out.push("", "What went wrong:");
    for (const l of a.whatWentWrong.slice(0, 6)) out.push(`  ${l}`);
  }

  if (a.failedTasks.length > 0) {
    out.push("", `Failed task${a.failedTasks.length > 1 ? "s" : ""}: ${a.failedTasks.join(", ")}`);
  }

  return out.join("\n");
}
