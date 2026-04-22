import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { estimateTokens } from "../../tokens.js";

export interface ReadLinesInput {
  path: string;
  start_line: number;
  end_line: number;
  max_tokens?: number;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function readLines(input: ReadLinesInput): Promise<string> {
  const absPath = resolve(input.path);
  let size: number;
  try {
    size = statSync(absPath).size;
  } catch (err) {
    return `[error] cannot stat ${absPath}: ${err instanceof Error ? err.message : err}`;
  }
  if (size > MAX_FILE_BYTES) {
    return `[error] ${absPath} is ${Math.round(size / 1024 / 1024)}MB (limit ${MAX_FILE_BYTES / 1024 / 1024}MB)`;
  }

  const source = readFileSync(absPath, "utf8");
  const all = source.split("\n");
  const start = Math.max(1, input.start_line);
  const end = Math.min(all.length, input.end_line);
  if (end < start) return `[error] end_line (${end}) < start_line (${start})`;

  const cap = input.max_tokens ?? 2000;
  const out: string[] = [`File: ${absPath}`, `Lines ${start}-${end} of ${all.length}`, ""];
  let tokens = estimateTokens(out.join("\n"));
  for (let i = start; i <= end; i++) {
    const line = `${i}: ${all[i - 1] ?? ""}`;
    const lineTokens = estimateTokens(line);
    if (tokens + lineTokens > cap) {
      out.push(`... [truncated at ${cap} tokens; use a narrower range]`);
      break;
    }
    out.push(line);
    tokens += lineTokens;
  }
  return out.join("\n");
}
