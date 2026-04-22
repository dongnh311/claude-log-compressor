# CLAUDE.md

Guidance for Claude Code working on this repo.

## Project

**smart-log-compress-mcp** — MCP server that compresses tool output (build/test/install logs, stack traces) before it reaches Claude's context. Claude calls this server's tools instead of running `bash` directly; the server runs the command, classifies the output, runs a type-specific compressor, caches the full log, and returns only a compact summary.

Full spec: `spec.md`. Target: >80% token reduction on typical build/test/install/stacktrace logs.

## Stack

- Language: TypeScript, ESM, Node ≥ 20
- MCP: `@modelcontextprotocol/sdk` over stdio
- Process execution: `execa`
- ANSI stripping: `strip-ansi`
- Token counting: `tiktoken`
- Config: `smol-toml` + `zod`
- Bundler: `esbuild` (single-file ESM bundle to `dist/index.js`)
- Tests: `vitest`
- Distribution: `npx smart-log-compress-mcp@latest`

## Layout

```
src/
  index.ts              # MCP server entrypoint (stdio transport)
  compressors/          # one file per compressor
    build.ts            # gradle/maven/cargo/go
    test.ts             # jest/vitest/pytest/junit
    install.ts          # npm/pip/gem/apt
    stacktrace.ts       # java/kotlin/python/js
    generic.ts          # dedupe + truncate fallback
    classifier.ts       # pick compressor from raw output
  cache/                # on-disk full-log cache (uuid → file, TTL 24h)
  config/               # .claude-log-compress.toml loader (zod-validated)
tests/                  # vitest
fixtures/               # real log samples for benchmark (gradle/npm/jest/…)
spec.md                 # full spec
```

## Pipeline

```
raw output → size check (<500 tok → passthrough)
           → classifier (regex/heuristic)
           → type-specific compressor
           → cache full log to disk
           → format response (summary + stats + reference id)
```

Every compressed response MUST include a reference id so Claude can call `get_full_output(id, grep?)` to retrieve the original.

## Exposed MCP tools

- `smart_run` — run any command, auto-classify
- `smart_build` — build tools (gradle/npm/cargo/make)
- `smart_test` — test runners (pytest/jest/junit)
- `smart_read_log` — read large log files with grep/section
- `get_full_output` — pull the cached full log by id

## Conventions

- Never silently drop errors from raw output. If unsure, fall back to `GenericCompressor` (dedupe + truncate) rather than an aggressive type-specific one.
- Always cache the full log before returning, even for short outputs — users need `--passthrough` / diff modes to trust the tool.
- Response format is fixed (see spec §3.3): status line, `[ERRORS]`, `[WARNINGS]` (with dedupe count), `[STATS]`, `[FULL LOG] id=…`.
- Token counts in `[STATS]` must use `tiktoken` with Claude's tokenizer, not char/4 estimates.
- Config is per-project (`.claude-log-compress.toml` at repo root). Schema lives in `src/config/` and is zod-validated.

## MVP scope (do not expand without explicit ask)

Week 1: skeleton + `smart_run` + classifier + `BuildCompressor` (gradle) + `TestCompressor` (jest/vitest) + cache + `get_full_output` + TOML config loader.

Week 2: `InstallCompressor` (npm/pip), `StackTraceCompressor` (Java/Kotlin/JS), tiktoken integration, benchmark fixtures, npm publish.

Out of scope for MVP: streaming output, pytest, auto-detect project type, UI/dashboard, plugin system, learning mode.

## Commands

- `npm run dev` — run server via `tsx` (for local MCP wiring)
- `npm run build` — esbuild bundle to `dist/index.js`
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — vitest once
- `npm run test:watch` — vitest watch mode

## Benchmarking

Fixtures in `fixtures/` are real log captures. Every compressor must have a corresponding fixture and a test that asserts ≥ target reduction (see spec §8 table) — if a compressor change drops reduction below target, treat it as a regression.
