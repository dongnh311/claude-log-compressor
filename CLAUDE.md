# CLAUDE.md

Guidance for Claude Code working on this repo.

## Project

**@dongnh311/claude-context-saver** (npm) / **dongnh311/claude-context-saver** (GitHub) — An MCP server that reduces Claude Code token consumption with two cooperating capabilities:

1. **Log compression** (`smart_run` / `smart_build` / `smart_test` / `read_log_section`) — runs build/test/install commands and returns compressed summaries instead of raw multi-thousand-token output. Ready in `v0.1.0`.
2. **Smart file reading** (`smart_read` / `list_symbols` / `read_symbol` / `find_references_in_file` / `read_lines`) — parses source files with tree-sitter and returns only the requested slices (outline, specific symbol, line range). Target `v0.2.0`.

Authoritative implementation spec: **`SPEC.md`** (unified v2 spec). Phase 1 pitch / history: `spec-overview.md`. Old phase-1-only spec: `SPEC-v0.1.md` (archive).

Success bar (SPEC §2):
- Log side: `smart_build` returns ≤ 15% of original log tokens, preserving 100% of error signals.
- File side: `smart_read` with focus returns ≤ 20% of the tokens of a full `Read` on ≥ 1000-line source files.

## Stack & constraints

- TypeScript strict mode, Node ≥ 18, ESM.
- **Runtime deps: `@modelcontextprotocol/sdk` + `web-tree-sitter`.** Node stdlib covers everything else. Do NOT add `execa`, `strip-ansi`, `tiktoken`, `zod`, etc. If you think you need one, re-read this line.
- Build: `tsc` (no bundler — MCP servers are small, keep it simple).
- Tests: `vitest`.
- Lint/format: `biome`.
- Distribution: `npx @dongnh311/claude-context-saver` via npm.
- Grammar `.wasm` files live in `src/grammars/wasm/` and ship bundled in the npm tarball (~5 MB total). Never download at runtime — zero network dependency at install.

## Layout

```
src/
  index.ts                     # shebang entry, prune cache, connect stdio
  server.ts                    # MCP tool registration + dispatch
  tokens.ts                    # chars/4 estimator (MVP heuristic)
  types.ts                     # Compressor, CompressedResult, ExecResult, Symbol, ParsedFile, …
  utils.ts                     # shared helpers (makeResult)
  install/
    install-command.ts         # `npx claude-context-saver install` → patch ~/.claude/mcp.json
  log-side/
    log-cache.ts               # ~/.cache/claude-context-saver/logs/<logId>.log, 7d TTL
    executor.ts                # spawn wrapper (timeout, maxBuffer, stripAnsi, process-group kill)
    classifier.ts              # command + firstKb → OutputKind
    tools/
      smart-run.ts             # any command → classify → compress
      smart-build.ts           # gradle/npm/cargo/make dispatch
      smart-test.ts            # jest/pytest/junit/go dispatch
      read-log-section.ts      # grep + line-range over cached log
    compressors/
      index.ts                 # registry/dispatcher
      generic.ts               # dedupe consecutive + preserve /error|fail|…/ + middle-truncate
      gradle.ts
      npm.ts
      jest.ts
      pytest.ts
      junit.ts
  file-side/                   # Phase 2 (M8–M13)
    parser.ts                  # tree-sitter wrapper
    language-registry.ts       # ext → grammar mapping
    symbol-index.ts            # AST → Symbol[]
    chunker.ts                 # oversized-symbol handling
    formatter.ts               # outline / focused-symbol text output
    fallback.ts                # line-based when parse fails
    file-cache.ts              # LRU + disk symbol cache
    tools/
      smart-read.ts
      list-symbols.ts
      read-symbol.ts
      find-references.ts
      read-lines.ts
  grammars/
    wasm/                      # bundled .wasm (Kotlin/Java/TS/JS/Python/Go/Rust)
    queries/                   # *.scm tree-sitter queries per language

test/
  fixtures/
    logs/                      # captured real-world log samples (Phase 1)
    sources/                   # real-world source samples (Phase 2)
  log-side/                    # Phase 1 tests
  file-side/                   # Phase 2 tests (M9+)
```

## Pipeline (log-side)

```
raw output → executor (stripAnsi, timeout, detached process group)
           → classifier (command + firstKb 1KB)
           → compressor (type-specific, falls back to generic)
           → cache full log to ~/.cache/claude-context-saver/logs/<logId>.log
           → format response (summary + body + stats + log_id hint)
```

## Pipeline (file-side, target)

```
path → stat / file_id (hash of path+mtime+size)
     → tree-sitter parse (lazy language load)
     → symbol-index query → Symbol[]
     → formatter (outline, focused bodies, or fallback chunks)
     → cache parsed tree in LRU (RAM) + symbols on disk
     → format response (outline + focused + stats + file_id hint)
```

Every response from BOTH sides MUST include the cache id (`log_id` / `file_id`) and a hint about the retrieval tool (`read_log_section` / `list_symbols` / `read_symbol` / `read_lines`). Claude must always have an escape hatch.

## Response format (SPEC §6.3 / §6.4 — don't change without updating SPEC)

Log side:
```
<summary line with status>

<body: errors, warnings, final task>

---
[Compressed from ~X tokens to ~Y tokens (Z% reduction)]
[Full log cached as log_id="prefix_abc12345". Use read_log_section to query details.]
```

File side:
```
File: <path>
Language: <lang> · <N> lines · ~<X> tokens (full file)
Returning: <mode> (~<Y> tokens, Z% reduction)

OUTLINE
---------------------------------------------------------
<tree of symbols with line ranges>

FOCUSED SYMBOLS
---------------------------------------------------------
<bodies of requested symbols>

---
[File cached as file_id="lang_abc12345"]
[Use list_symbols / read_symbol / read_lines for more detail]
```

## Conventions

- **stdout is the MCP transport — never write to it.** Diagnostic logs go to `~/.cache/claude-context-saver/server.log` via shared cache helper. Use `process.stderr` only for last-resort fatals.
- Every tool handler wraps its body in try/catch (done in `server.ts`). Never let an exception crash the MCP server.
- Every log compressor must **always preserve lines matching `/error|fail(ed|ure)?|exception|fatal|panic/i`** — dropping a real error is the only unrecoverable bug. When in doubt, fall back to generic.
- Strip ANSI in the executor, not in compressors.
- File-side parse errors → fall back to line-based chunking (`fallback.ts`). NEVER throw out of a tool handler.
- No `any` without a justification comment.
- Log IDs: `<prefix>_<12 hex>` e.g. `grd_abc123def456`. Prefix = compressor kind.
- File IDs: `<langprefix>_<8 hex>` e.g. `kt_7f3ab2c1`. Prefix = language (kt, ts, py, …).
- Cache cleanup: prune entries older than 7 days at server start (happens in `index.ts#main`).
- Paths: resolve to absolute early; stat before parsing; meaningful errors on symlink / exotic FS edge cases.

## Commands

- `npm run build` — `tsc` → `dist/`, postbuild adds shebang + chmod +x
- `npm run dev` — `tsc --watch`
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — vitest once
- `npm run bench` — log-side benchmark table
- `npm run lint` / `npm run format` — biome
- `npx @modelcontextprotocol/inspector node dist/index.js` — manually exercise tools

## Milestones (SPEC §10 — work one at a time, stop-and-ask between)

### Phase 1 (shipped as `@dongnh311/claude-context-saver@0.1.0`, ported from `claude-log-compressor@0.1.0`)
- **M1–M7** — done. Log compression with 6 compressors, `smart_{run,build,test}` + `read_log_section`, CI green on ubuntu+macOS × Node 18/20/22, benchmarks captured live on MasterCamera (avg 93% reduction).

### Phase 2 (target `v0.2.0`)
- **M8** tree-sitter plumbing + 7 grammars bundled + language registry + parser wrapper.
- **M9** symbol extraction for Kotlin + TypeScript first.
- **M10** `list_symbols` + `read_symbol` + file cache (LRU + disk, keyed by path+mtime+size).
- **M11** `smart_read` + formatter + oversized-symbol chunker.
- **M12** Java/JS/Python/Go/Rust queries + fallback + `find_references_in_file` + `read_lines`.
- **M13** benchmark table + `install` command covers v0.1→v0.2 upgrade + `npm publish --access public`.

Out of MVP (Phase 3): Swift grammar (defer — community grammar lags), `preview_edit` tool, streaming output, HTTP transport, native Windows.

## Benchmark rule

Every compressor ships with at least one fixture in `test/fixtures/logs/`. Every language parser ships with at least one fixture in `test/fixtures/sources/`. Tests assert minimum reduction ratios per SPEC §11 table. A change that drops a ratio below target is a regression — fix before merging.

## Package-rename history

This repo was published as `claude-log-compressor@0.1.0` initially; renamed to `@dongnh311/claude-context-saver` when Phase 2 (file side) was added because the tool is no longer just log-specific. The old npm name is deprecated with a pointer to this one.
