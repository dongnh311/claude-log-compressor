import { readLog } from "../log-cache.js";
import { estimateTokens } from "../../tokens.js";

export interface ReadLogSectionInput {
  log_id: string;
  grep?: string;
  lines_around?: number;
  start_line?: number;
  end_line?: number;
  max_tokens?: number;
}

const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_CONTEXT = 3;

export async function readLogSection(input: ReadLogSectionInput): Promise<string> {
  const full = await readLog(input.log_id);
  if (full === null) {
    return `[error] log_id "${input.log_id}" not found (cache miss or expired)`;
  }

  const lines = full.split("\n");
  let selected: string[];

  if (input.grep) {
    selected = grepWithContext(lines, input.grep, input.lines_around ?? DEFAULT_CONTEXT);
  } else if (input.start_line !== undefined || input.end_line !== undefined) {
    const start = Math.max(0, (input.start_line ?? 1) - 1);
    const end = Math.min(lines.length, input.end_line ?? lines.length);
    selected = lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`);
  } else {
    selected = lines.slice(0, 200).map((l, i) => `${i + 1}: ${l}`);
  }

  return capTokens(selected, input.max_tokens ?? DEFAULT_MAX_TOKENS);
}

function grepWithContext(lines: string[], pattern: string, context: number): string[] {
  let re: RegExp;
  try {
    re = new RegExp(pattern, "i");
  } catch {
    return [`[error] invalid regex: ${pattern}`];
  }

  const keep = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i] ?? "")) {
      for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) {
        keep.add(j);
      }
    }
  }

  const out: string[] = [];
  let prev = -2;
  for (const idx of Array.from(keep).sort((a, b) => a - b)) {
    if (idx > prev + 1) out.push("---");
    out.push(`${idx + 1}: ${lines[idx]}`);
    prev = idx;
  }
  return out;
}

function capTokens(lines: string[], maxTokens: number): string {
  const out: string[] = [];
  let tokens = 0;
  for (const line of lines) {
    const t = estimateTokens(line) + 1;
    if (tokens + t > maxTokens) {
      out.push(`… [truncated at ${maxTokens} tokens; use start_line/end_line to paginate]`);
      break;
    }
    out.push(line);
    tokens += t;
  }
  return out.join("\n");
}
