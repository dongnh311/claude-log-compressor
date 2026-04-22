import { estimateTokens } from "../../tokens.js";
import type { ClassifierInput, CompressContext, CompressedResult, Compressor } from "../../types.js";
import { makeResult } from "../../utils.js";

const ERROR_RE = /\b(error|fail(ed|ure)?|exception|fatal|panic)\b/i;

export const genericCompressor: Compressor = {
  name: "generic",

  canHandle(_input: ClassifierInput): boolean {
    return true;
  },

  compress(fullLog: string, context: CompressContext): CompressedResult {
    const lines = fullLog.split("\n");
    const deduped = dedupeConsecutive(lines);
    const errorLines: string[] = [];
    for (const line of deduped) {
      if (ERROR_RE.test(line)) errorLines.push(line);
    }

    const body = middleTruncate(deduped, context.maxTokens).join("\n");
    const errorsBlock = errorLines.length
      ? `Error-matching lines (${errorLines.length}):\n${errorLines.slice(0, 50).join("\n")}\n\n`
      : "";

    const bodyText = errorsBlock + body;
    const summary = errorLines.length
      ? `Command output (${errorLines.length} error-matching lines)`
      : "Command output";
    return makeResult(summary, bodyText, fullLog, context);
  },
};

function dedupeConsecutive(lines: string[]): string[] {
  const out: string[] = [];
  let prev: string | undefined;
  let repeat = 0;
  for (const line of lines) {
    if (line === prev) {
      repeat++;
    } else {
      if (repeat > 0 && out.length > 0) out.push(`  … (repeated ${repeat + 1}×)`);
      out.push(line);
      prev = line;
      repeat = 0;
    }
  }
  if (repeat > 0) out.push(`  … (repeated ${repeat + 1}×)`);
  return out;
}

function middleTruncate(lines: string[], maxTokens: number): string[] {
  const joined = lines.join("\n");
  if (estimateTokens(joined) <= maxTokens) return lines;
  const headCount = Math.floor(lines.length * 0.3);
  const tailCount = Math.floor(lines.length * 0.5);
  const head = lines.slice(0, headCount);
  const tail = lines.slice(lines.length - tailCount);
  const dropped = lines.length - head.length - tail.length;
  return [...head, `… [${dropped} lines omitted] …`, ...tail];
}
