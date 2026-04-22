import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pickCompressor } from "../src/compressors/index.js";
import { classify } from "../src/classifier.js";

const FIX_DIR = join(process.cwd(), "test", "fixtures");

interface Row {
  fixture: string;
  kind: string;
  original: number;
  compressed: number;
  reduction: string;
}

const rows: Row[] = [];
for (const file of readdirSync(FIX_DIR).sort()) {
  if (!file.endsWith(".log")) continue;
  const raw = readFileSync(join(FIX_DIR, file), "utf8");

  const kind = classify({
    command: inferCommand(file),
    cwd: "/",
    exitCode: file.includes("failure") ? 1 : 0,
    firstKb: raw.slice(0, 1024),
  });

  const compressor = pickCompressor(kind);
  const result = compressor.compress(raw, { maxTokens: 2000, logId: "bench" });
  const reduction =
    result.originalTokens > 0
      ? ((1 - result.compressedTokens / result.originalTokens) * 100).toFixed(1)
      : "0.0";
  rows.push({
    fixture: file,
    kind,
    original: result.originalTokens,
    compressed: result.compressedTokens,
    reduction: `${reduction}%`,
  });
}

const w = {
  fixture: Math.max(7, ...rows.map((r) => r.fixture.length)),
  kind: Math.max(4, ...rows.map((r) => r.kind.length)),
  original: 9,
  compressed: 11,
  reduction: 9,
};

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(
  pad("Fixture", w.fixture),
  pad("Kind", w.kind),
  pad("Original", w.original),
  pad("Compressed", w.compressed),
  pad("Reduction", w.reduction),
);
console.log("-".repeat(w.fixture + w.kind + w.original + w.compressed + w.reduction + 8));
for (const r of rows) {
  console.log(
    pad(r.fixture, w.fixture),
    pad(r.kind, w.kind),
    pad(r.original, w.original),
    pad(r.compressed, w.compressed),
    pad(r.reduction, w.reduction),
  );
}

function inferCommand(filename: string): string {
  if (filename.startsWith("gradle")) return "./gradlew build";
  if (filename.startsWith("npm")) return "npm install";
  if (filename.startsWith("jest")) return "npx jest";
  if (filename.startsWith("pytest")) return "pytest";
  return "unknown";
}
