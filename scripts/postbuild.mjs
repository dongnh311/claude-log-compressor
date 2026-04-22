import { chmodSync, copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// 1. shebang + chmod on entry
const entry = join(ROOT, "dist", "index.js");
const src = readFileSync(entry, "utf8");
if (!src.startsWith("#!")) {
  writeFileSync(entry, `#!/usr/bin/env node\n${src}`);
}
chmodSync(entry, 0o755);

// 2. copy tree-sitter .wasm grammars (tsc only handles .ts files)
const wasmSrc = join(ROOT, "src", "grammars", "wasm");
const wasmDst = join(ROOT, "dist", "grammars", "wasm");
mkdirSync(wasmDst, { recursive: true });
let copied = 0;
for (const name of readdirSync(wasmSrc)) {
  if (!name.endsWith(".wasm")) continue;
  copyFileSync(join(wasmSrc, name), join(wasmDst, name));
  copied++;
}

// 3. copy tree-sitter query files (.scm)
const queriesSrc = join(ROOT, "src", "grammars", "queries");
const queriesDst = join(ROOT, "dist", "grammars", "queries");
mkdirSync(queriesDst, { recursive: true });
let copiedScm = 0;
try {
  for (const name of readdirSync(queriesSrc)) {
    if (!name.endsWith(".scm")) continue;
    copyFileSync(join(queriesSrc, name), join(queriesDst, name));
    copiedScm++;
  }
} catch {
  // queries dir may be empty until M9 lands queries
}

console.log(`postbuild: entry ready, ${copied} .wasm + ${copiedScm} .scm copied to dist/grammars/`);
