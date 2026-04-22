// Measure smart_read on a real source file.
// Usage: npx tsx scripts/real-world-file-test.ts <path> [focus]

import { readFileSync } from "node:fs";
import { estimateTokens } from "../src/tokens.js";
import { listSymbols } from "../src/file-side/tools/list-symbols.js";
import { smartRead } from "../src/file-side/tools/smart-read.js";

const [, , path, focus] = process.argv;
if (!path) {
  console.error("usage: tsx scripts/real-world-file-test.ts <path> [focus]");
  process.exit(1);
}

const source = readFileSync(path, "utf8");
const lines = source.split("\n").length;
const full = estimateTokens(source);

const outlineText = await smartRead({ path, mode: "outline" });
const outline = estimateTokens(outlineText);
const pctOutline = ((1 - outline / full) * 100).toFixed(1);

let focusTokens = 0;
let pctFocus = "—";
if (focus) {
  const focusedText = await smartRead({ path, focus });
  focusTokens = estimateTokens(focusedText);
  pctFocus = `${((1 - focusTokens / full) * 100).toFixed(1)}%`;
}

const listOut = await listSymbols({ path });
const listTokens = estimateTokens(listOut);

console.log("========================================");
console.log(`File:             ${path}`);
console.log(`Size:             ${lines} lines / ~${full} tokens`);
console.log(`list_symbols:     ~${listTokens} tokens`);
console.log(`smart_read outline: ~${outline} tokens (${pctOutline}% reduction)`);
if (focus) {
  console.log(`smart_read focus='${focus}': ~${focusTokens} tokens (${pctFocus} reduction)`);
}
console.log("========================================");
