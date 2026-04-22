import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { estimateTokens } from "../src/tokens.js";
import { languageFromPath } from "../src/file-side/language-registry.js";
import { smartRead } from "../src/file-side/tools/smart-read.js";

const FIX = join(process.cwd(), "test", "fixtures", "sources");

interface Row {
  fixture: string;
  lang: string;
  lines: number;
  full: number;
  outline: number;
  focused: number | null;
  reduction: string;
}

const focusOverrides: Record<string, string> = {
  "AuthViewModel.kt": "login",
  "api.ts": "PostsController",
};

const rows: Row[] = [];
for (const file of readdirSync(FIX).sort()) {
  const path = join(FIX, file);
  const lang = languageFromPath(path);
  if (!lang) continue;
  const source = readFileSync(path, "utf8");
  const lines = source.split("\n").length;
  const full = estimateTokens(source);

  const outlineText = await smartRead({ path, mode: "outline" });
  const outline = estimateTokens(outlineText);

  let focused: number | null = null;
  const focus = focusOverrides[file];
  if (focus) {
    const text = await smartRead({ path, focus });
    focused = estimateTokens(text);
  }

  const compare = focused ?? outline;
  const reduction = full > 0 ? `${((1 - compare / full) * 100).toFixed(1)}%` : "0.0%";
  rows.push({ fixture: file, lang, lines, full, outline, focused, reduction });
}

const w = {
  fixture: Math.max(8, ...rows.map((r) => r.fixture.length)),
  lang: Math.max(4, ...rows.map((r) => r.lang.length)),
  lines: 5,
  full: 6,
  outline: 7,
  focused: 7,
  reduction: 9,
};

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log(
  pad("Fixture", w.fixture),
  pad("Lang", w.lang),
  pad("Lines", w.lines),
  pad("Full", w.full),
  pad("Outline", w.outline),
  pad("Focused", w.focused),
  pad("Reduction", w.reduction),
);
console.log("-".repeat(w.fixture + w.lang + w.lines + w.full + w.outline + w.focused + w.reduction + 12));
for (const r of rows) {
  console.log(
    pad(r.fixture, w.fixture),
    pad(r.lang, w.lang),
    pad(r.lines, w.lines),
    pad(r.full, w.full),
    pad(r.outline, w.outline),
    pad(r.focused ?? "—", w.focused),
    pad(r.reduction, w.reduction),
  );
}
