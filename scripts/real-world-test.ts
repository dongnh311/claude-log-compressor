// Side-by-side test: run a real command via execCommand + classify + compress,
// then report raw vs. compressed token counts for a real project.
//
// Usage:
//   npx tsx scripts/real-world-test.ts <cwd> <command>
//   npx tsx scripts/real-world-test.ts ~/Documents/GitHub/OnTheFly-Android "./gradlew assembleDebug"

import { writeFileSync } from "node:fs";
import { classify } from "../src/log-side/classifier.js";
import { pickCompressor } from "../src/log-side/compressors/index.js";
import { newLogId } from "../src/log-side/log-cache.js";
import { execCommand } from "../src/log-side/executor.js";
import { estimateTokens } from "../src/tokens.js";

const [, , cwdArg, ...cmdParts] = process.argv;
if (!cwdArg || cmdParts.length === 0) {
  console.error("usage: tsx scripts/real-world-test.ts <cwd> <command…>");
  process.exit(1);
}
const command = cmdParts.join(" ");
const cwd = cwdArg.replace(/^~/, process.env.HOME ?? "");

console.error(`[real-world-test] cwd=${cwd}`);
console.error(`[real-world-test] cmd=${command}`);
console.error(`[real-world-test] running (up to 5 min)…`);

const start = Date.now();
const r = await execCommand({ command, cwd, timeoutMs: 300_000 });
console.error(
  `[real-world-test] done: exit=${r.exitCode} duration=${(r.durationMs / 1000).toFixed(1)}s timedOut=${r.timedOut}`,
);

const fullLog = [r.stdout, r.stderr].filter(Boolean).join("\n");
const originalTokens = estimateTokens(fullLog);

const kind = classify({
  command,
  cwd,
  exitCode: r.exitCode,
  firstKb: fullLog.slice(0, 1024),
});
const compressor = pickCompressor(kind);
const logId = newLogId(kind);
const result = compressor.compress(fullLog, { maxTokens: 3000, logId });

const reduction =
  originalTokens > 0 ? ((1 - result.compressedTokens / originalTokens) * 100).toFixed(1) : "0.0";

// Write raw and compressed to /tmp for inspection
writeFileSync(`/tmp/rwt-raw.log`, fullLog);
writeFileSync(`/tmp/rwt-compressed.txt`, `${result.summary}\n\n${result.body}`);

console.log("");
console.log("========================================");
console.log(`Command     : ${command}`);
console.log(`Cwd         : ${cwd}`);
console.log(`Exit code   : ${r.exitCode}`);
console.log(`Duration    : ${(r.durationMs / 1000).toFixed(1)}s`);
console.log(`Classified  : ${kind}`);
console.log(`Raw tokens  : ${originalTokens.toLocaleString()}`);
console.log(`Compressed  : ${result.compressedTokens.toLocaleString()}`);
console.log(`Reduction   : ${reduction}%`);
console.log("");
console.log(`Raw saved   : /tmp/rwt-raw.log`);
console.log(`Compressed  : /tmp/rwt-compressed.txt`);
console.log("========================================");
console.log("");
console.log("=== COMPRESSED OUTPUT (what Claude would see) ===");
console.log(result.summary);
console.log("");
console.log(result.body);
console.log("");
console.log(
  `[Compressed from ~${originalTokens} tokens → ~${result.compressedTokens} tokens (${reduction}% reduction)]`,
);
console.log(
  `[Full log cached as log_id="${logId}". Use read_log_section to query details.]`,
);

console.error(`[real-world-test] total wall time: ${((Date.now() - start) / 1000).toFixed(1)}s`);
