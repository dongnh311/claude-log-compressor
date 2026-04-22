import { classify } from "../classifier.js";
import { pickCompressor } from "../compressors/index.js";
import { newLogId, writeLog } from "../log-cache.js";
import { execCommand } from "../executor.js";
import type { CompressedResult } from "../../types.js";

export interface SmartRunInput {
  command: string;
  cwd?: string;
  timeout_seconds?: number;
  max_output_tokens?: number;
}

export async function smartRun(input: SmartRunInput): Promise<string> {
  const maxTokens = input.max_output_tokens ?? 2000;
  const timeoutMs = (input.timeout_seconds ?? 300) * 1000;

  const result = await execCommand({
    command: input.command,
    cwd: input.cwd,
    timeoutMs,
  });

  const fullLog = [result.stdout, result.stderr].filter(Boolean).join("\n");
  const kind = classify({
    command: input.command,
    cwd: input.cwd ?? process.cwd(),
    exitCode: result.exitCode,
    firstKb: fullLog.slice(0, 1024),
  });

  const logId = newLogId(kind);
  await writeLog(logId, fullLog);

  const compressor = pickCompressor(kind);
  const compressed = compressor.compress(fullLog, { maxTokens, logId });

  return formatResponse(compressed, {
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
  });
}

export function formatResponse(
  r: CompressedResult,
  meta: { exitCode: number; durationMs: number; timedOut: boolean },
): string {
  const reduction =
    r.originalTokens > 0
      ? Math.round(((r.originalTokens - r.compressedTokens) / r.originalTokens) * 100)
      : 0;
  const status = meta.timedOut
    ? "TIMED OUT"
    : meta.exitCode === 0
      ? "OK"
      : `EXIT ${meta.exitCode}`;

  return [
    `${r.summary} [${status}, ${meta.durationMs}ms]`,
    "",
    r.body,
    "",
    "---",
    `[Compressed from ~${r.originalTokens} tokens → ~${r.compressedTokens} tokens (${reduction}% reduction)]`,
    `[Full log cached as log_id="${r.logId}". Use read_log_section to query details.]`,
  ].join("\n");
}
