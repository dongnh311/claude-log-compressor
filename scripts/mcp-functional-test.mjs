// Live MCP protocol test. Spawns `node dist/index.js` as a child,
// sends real JSON-RPC messages, verifies responses.
//
// Usage:
//   node scripts/mcp-functional-test.mjs [target-file]

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TARGET = resolve(
  process.argv[2] ??
    `${process.env.HOME}/Documents/GitHub/MasterCamera/MasterCamera/src/main/java/com/dongnh/mastercamera/control/CameraControl.kt`,
);

function sendAll(child, messages) {
  for (const m of messages) {
    child.stdin.write(`${JSON.stringify(m)}\n`);
  }
  child.stdin.end();
}

function run() {
  return new Promise((res, rej) => {
    const child = spawn("node", [`${ROOT}/dist/index.js`], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => { out += c.toString(); });
    child.stderr.on("data", (c) => { err += c.toString(); });
    child.on("close", (code) => res({ code, out, err }));
    child.on("error", rej);

    sendAll(child, [
      { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "ft", version: "0" } } },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      // 1. smart_read outline
      { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "smart_read", arguments: { path: TARGET } } },
      // 2. smart_read with focus
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "smart_read", arguments: { path: TARGET, focus: "startRecording" } } },
      // 3. list_symbols
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_symbols", arguments: { path: TARGET } } },
      // 4. read_symbol
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "read_symbol", arguments: { path: TARGET, names: ["startRecording"] } } },
      // 5. find_references_in_file
      { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "find_references_in_file", arguments: { path: TARGET, identifier: "mediaRecorder" } } },
      // 6. read_lines
      { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "read_lines", arguments: { path: TARGET, start_line: 1, end_line: 30 } } },
    ]);
  });
}

const { out, err } = await run();

const lines = out.split("\n").filter(Boolean);
const responses = lines.map((l) => {
  try { return JSON.parse(l); } catch { return null; }
}).filter(Boolean);

function extract(id) {
  const r = responses.find((r) => r.id === id);
  if (!r) return { ok: false, text: "<no response>" };
  const text = r.result?.content?.[0]?.text ?? r.error?.message ?? "<no content>";
  return { ok: !r.error, text, tokens: Math.ceil(text.length / 4) };
}

const cases = [
  { id: 2, name: "smart_read outline",              expect: ["OUTLINE", "file_id: kt_"] },
  { id: 3, name: "smart_read focus=startRecording",     expect: ["FOCUSED SYMBOLS", "startRecording", "← focused"] },
  { id: 4, name: "list_symbols",                     expect: ["class", "file_id: kt_", "SYMBOLS"] },
  { id: 5, name: "read_symbol startRecording",          expect: ["```", "startRecording"] },
  { id: 6, name: "find_references_in_file",          expect: ["match", "mediaRecorder"] },
  { id: 7, name: "read_lines 1-30",                  expect: ["Lines 1-30", "package "] },
];

let ok = 0;
console.log(`Target:       ${TARGET}`);
console.log("");
console.log("#  Tool                             Tokens  Result");
console.log("-".repeat(70));
for (const c of cases) {
  const r = extract(c.id);
  const missing = c.expect.filter((e) => !r.text.includes(e));
  const pass = missing.length === 0 && r.ok;
  if (pass) ok++;
  const mark = pass ? "✓" : "✗";
  console.log(`${c.id}  ${c.name.padEnd(32)} ${String(r.tokens).padStart(6)}  ${mark}${missing.length ? ` missing: ${missing.join(", ")}` : ""}`);
}
console.log("");
console.log(`${ok}/${cases.length} MCP functional tests passing`);

if (err.includes("Error") || err.includes("TypeError")) {
  console.log("\nstderr diagnostics:");
  console.log(err.split("\n").filter((l) => l.includes("Error") || l.includes("fatal")).slice(0, 5).join("\n"));
}

process.exit(ok === cases.length ? 0 : 1);
