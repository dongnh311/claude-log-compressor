# @dongnh311/claude-context-saver

[![npm](https://img.shields.io/npm/v/@dongnh311/claude-context-saver.svg)](https://www.npmjs.com/package/@dongnh311/claude-context-saver)
[![CI](https://github.com/dongnh311/claude-context-saver/actions/workflows/ci.yml/badge.svg)](https://github.com/dongnh311/claude-context-saver/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/@dongnh311/claude-context-saver.svg)](./LICENSE)

> MCP server that cuts Claude Code token usage through two cooperating capabilities:
> **(1) log compression** for build/test/install output, **(2) smart file reading** for source code at the symbol level. Same philosophy: don't let raw, unfiltered content flood Claude's context — let Claude pull exactly what it needs.

> **Note:** this package was originally published as `claude-log-compressor` (log side only). It has been renamed to `@dongnh311/claude-context-saver` now that file-side capabilities are landing. The old name is deprecated; please update your config (see Quick start).

## Quick start

**1.** Add to your Claude Code MCP config at `~/.claude/mcp.json` (or project `.claude/mcp.json`):

```json
{
  "mcpServers": {
    "context-saver": {
      "command": "npx",
      "args": ["-y", "@dongnh311/claude-context-saver@latest"]
    }
  }
}
```

Or via CLI:

```bash
claude mcp add context-saver -s user -- npx -y @dongnh311/claude-context-saver@latest
```

**2.** Restart Claude Code. Tools `smart_run`, `smart_build`, `smart_test`, `read_log_section` show up now. File-side tools (`smart_read`, `list_symbols`, `read_symbol`, `find_references_in_file`, `read_lines`) ship in `v0.2.0`.

**3.** (Recommended) Nudge Claude in your project's `CLAUDE.md`:

```markdown
## Token-efficient tooling (claude-context-saver)
- Build/test: use `smart_build` / `smart_test` instead of bash gradle/npm/jest/pytest.
- File reading (from v0.2): prefer `smart_read` over `Read` for source files > 300 lines.
```

## Why

Two dominant sources of wasted tokens in a Claude Code session:

- **Noisy command output.** `gradle build`, `npm install`, `pytest` can emit 5k–20k tokens per invocation, 90% of which is progress bars, deprecation warnings, and framework noise.
- **Whole-file reads for narrow questions.** Claude reads a 2,000-line `MainActivity.kt` to fix one function; 90% of what goes into context is irrelevant.

Both compound quickly: the Pro 5-hour limit hits before the real work is done, prompt-cache hit rate drops, and the model's attention gets diluted.

## How it works

Claude calls the MCP tool instead of `bash`/`Read`. The server runs the command (or parses the file), keeps the heavy output on disk, and returns only a compact summary plus an id Claude can use to retrieve detail on demand.

```
[Claude] ──► smart_build("./gradlew assembleDebug")
              │
              ▼
         [context-saver]
              │
              ├─► run command → 12k tokens raw
              │      │
              │      ▼
              │   classify → "gradle"
              │      │
              │      ▼
              │   gradle compressor (errors, deduped warnings, failing task)
              │      │
              │      ▼
              │   cache full log → ~/.cache/claude-context-saver/logs/grd_abc12345.log (7d TTL)
              │
              └─► return 0.8k token summary + log_id="grd_abc12345"
[Claude] ◄──
```

Same pattern for `smart_read`: parse file → return outline first, focused symbols on demand, cache AST for the session.

## Tools (v0.1.0 — log side)

| Tool | Input (highlights) | What it does |
|---|---|---|
| `smart_run` | `command`, `cwd?`, `timeout_seconds?`, `max_output_tokens?` | Runs any shell command, auto-classifies output, returns compressed summary + `log_id`. |
| `smart_build` | `tool?` (`gradle`/`npm`/`cargo`/`make`/`auto`), `args?`, `cwd?` | Auto-detects build tool from `cwd` (gradlew, package.json, Cargo.toml, Makefile). |
| `smart_test` | `framework?` (`jest`/`pytest`/`junit`/`go`/`auto`), `pattern?`, `cwd?` | Auto-detects test framework (go.mod, pytest config, package.json, gradlew). |
| `read_log_section` | `log_id`, `grep?`, `lines_around?`, `start_line?`/`end_line?`, `max_tokens?` | Slice a cached full log. Escape hatch when compressed view isn't enough. |

## Tools (v0.2.0 — file side, target)

| Tool | Input | What it does |
|---|---|---|
| `smart_read` | `path`, `focus?`, `mode?` (`outline`/`full`/`auto`), `max_tokens?` | Smart replacement for Read. Returns outline first, focused symbols on demand. |
| `list_symbols` | `path`, `kinds?`, `depth?` | Full symbol tree without bodies. |
| `read_symbol` | `path`, `names[]` (dotted: `Class.method`), `include_surrounding?` | Return bodies of named symbols. |
| `find_references_in_file` | `path`, `identifier`, `context_lines?` | AST-aware "where is X used inside this file" with `inside_symbol` annotation. |
| `read_lines` | `path`, `start_line`, `end_line` | Line-range fallback when symbol approach doesn't fit. |

Languages supported in MVP (file side): Kotlin, Java, TypeScript/TSX, JavaScript/JSX, Python, Go, Rust. Swift deferred to Phase 3.

## Benchmark — real Android project

Measured live on `./gradlew …` against a real Android Compose + C++/NDK project (MasterCamera, 2 Gradle modules):

| Command | Raw tokens | Compressed | Reduction |
|---|---:|---:|---:|
| `clean :app:assembleDebug` | 2,090 | 82 | **96.1%** |
| `clean :app:assembleRelease` (R8) | 2,720 | 82 | **97.0%** |
| `:app:installDebug` → emulator | 955 | 3 | **99.7%** |
| `:app:testDebugUnitTest` | 780 | 82 | **89.5%** |
| `:app:compileDebugKotlin` (2 injected errors) | 667 | 114 | **82.9%** ⟵ both errors with `file:line:col` preserved |

Average ≈ **93%** reduction, 100% of errors and warnings kept.

## Benchmark — synthetic fixtures (log side)

| Fixture | Kind | Original | Compressed | Reduction |
|---|---|---:|---:|---:|
| gradle-success.log | gradle | 1,005 | 64 | **93.6%** |
| gradle-failure.log | gradle | 1,708 | 173 | **89.9%** |
| jest-passing.log | jest | 242 | 34 | **86.0%** |
| jest-failing.log | jest | 578 | 363 | 37.2% |
| junit-failing.log | junit | 827 | 151 | **81.7%** |
| npm-install-success.log | npm | 648 | 218 | 66.4% |
| npm-install-fail.log | npm | 337 | 279 | 17.2% (info-dense) |
| pytest-passing.log | pytest | 224 | 20 | **91.1%** |
| pytest-failing.log | pytest | 583 | 333 | 42.9% |

Run locally: `npm run bench`.

## What each log compressor keeps / drops

### Gradle
- **Keep:** BUILD status + duration, every Kotlin/javac error with `file:line:col`, deduped warnings with occurrence counts (`[×3]`), failing task name, "What went wrong" block.
- **Drop:** `> Task :xxx UP-TO-DATE/NO-SOURCE`, `Download …` URLs, Daemon startup chatter.

### npm / yarn / pnpm
- **Keep:** `npm ERR!` blocks with error code, `added X packages`, deduped deprecations (per package, top 10), audit summary.
- **Drop:** duplicate deprecation lines, download progress, boilerplate audit text.

### Jest / Vitest
- **Keep:** `Test Suites:` / `Tests:` / `Time:` summary, every `● Test › name` failure block with assertion diff.
- **Drop:** `PASS src/…` names (collapsed to count), duplicated "Summary of failing tests" block.

### Pytest
- **Keep:** platform header, `ERRORS:` + `FAILURES:` blocks verbatim, short summary info, final result line.
- **Drop:** progress dot lines (`tests/foo.py ...... [10%]`), rootdir/plugin chatter.

### JUnit (Gradle/Maven test output)
- **Keep:** each `FAILED` test with FQCN + assertion + app stack frames, total count.
- **Drop:** `PASSED` names (count only), framework frames (`org.junit.*`, `java.base/jdk.internal.*`, `kotlinx.coroutines.internal.*`, `android.os.*`, reflection).

### Generic (fallback)
- **Keep:** every line matching `/error|fail|exception|fatal|panic/i`.
- **Transform:** consecutive identical lines deduped, middle-truncated when over budget.

## FAQ

**What if the compressor drops something I need?**
Every response includes `log_id`. Call `read_log_section` with a `grep` pattern or `start_line`/`end_line`. Full log is on disk for 7 days.

**Does it work on Windows?**
WSL only in v0.1/v0.2. Native Windows is Phase 3.

**Does it send anything to a server?**
No. Commands run locally, logs live on your disk, nothing phones home.

**Will Claude actually use `smart_*` instead of bash?**
With the CLAUDE.md snippet in Quick start, yes. Tool descriptions also explicitly say "ALWAYS prefer this". In practice adherence is high.

**Why a scoped package name (`@dongnh311/…`)?**
The plain `claude-context-saver` unscoped name was already taken by an unrelated package. Scoped keeps the descriptive name.

## Development

```bash
npm install
npm run typecheck
npm test           # vitest
npm run bench      # compressor benchmark table
npm run build      # tsc → dist/index.js (+ shebang + chmod)
npm run dev        # tsc --watch
npx @modelcontextprotocol/inspector node dist/index.js   # manual tool exercise
```

Layout, conventions, milestones: see [`CLAUDE.md`](./CLAUDE.md).
Unified implementation spec: [`SPEC.md`](./SPEC.md). Archived log-only spec: [`SPEC-v0.1.md`](./SPEC-v0.1.md). High-level pitch: [`spec-overview.md`](./spec-overview.md).

## Links

- **npm:** [`@dongnh311/claude-context-saver`](https://www.npmjs.com/package/@dongnh311/claude-context-saver)
- **GitHub:** [dongnh311/claude-context-saver](https://github.com/dongnh311/claude-context-saver)
- **Issues / feedback:** [GitHub Issues](https://github.com/dongnh311/claude-context-saver/issues)

## License

MIT
