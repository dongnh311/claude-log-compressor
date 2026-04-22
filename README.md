# claude-log-compressor

> MCP server that intercepts build/test/install commands, runs them, and returns a compressed summary to Claude instead of the raw multi-thousand-token output. Cuts context consumption during iterative build/test loops by 60–95%.

## Why

When Claude Code runs commands like `gradle build`, `npm install`, `pytest`, or reads large logs, the raw output often consumes 5,000–20,000 tokens per invocation. Over a session, that exhausts the Pro-tier 5-hour limit and the context window far faster than necessary — and 90% of it is noise:

- `gradle build`: progress lines, `> Task :xxx UP-TO-DATE`, Download URLs, configure chatter
- `npm install`: duplicate deprecation warnings, peer-dep notes, audit boilerplate
- `pytest -v`: passed-test verbose log dominates; real signal is in failed tests
- Android stack traces: 50–100 frames, of which only 3–5 are app code

## How it works

Claude calls the MCP tool instead of `bash`. This server runs the command, captures the full output, classifies it (gradle / npm / jest / pytest / junit / generic), applies a type-specific compressor, caches the full log to disk, and returns only a compact summary.

```
[Claude] → smart_run("./gradlew assembleDebug")
              ↓
         [claude-log-compressor]
              ↓
         run command → 12k tokens raw output
              ↓
         classify → "gradle"
              ↓
         gradle compressor (errors, deduped warnings, failing task)
              ↓
         cache full log → ~/.cache/claude-log-compressor/grd_abc123.log (7d TTL)
              ↓
         return 1.5k token summary + log_id="grd_abc123"
              ↑
[Claude] ← summary; can call read_log_section("grd_abc123", grep="...") for detail
```

## Install

Add to your Claude Code MCP config (`~/.claude/mcp.json` or project `.claude/mcp.json`):

```json
{
  "mcpServers": {
    "log-compressor": {
      "command": "npx",
      "args": ["-y", "claude-log-compressor"]
    }
  }
}
```

Then in the same session (or your project `CLAUDE.md`), tell the model to prefer `smart_*` over bash for noisy commands:

```markdown
## Build/test commands
Always use `smart_build` and `smart_test` (from the log-compressor MCP server)
instead of invoking gradle/npm/jest/pytest directly via bash. They return the
same information in 5–10× fewer tokens.
```

## Tools

| Tool | Input | What it does |
|---|---|---|
| `smart_run` | `command`, optional `cwd`, `timeout_seconds`, `max_output_tokens` | Runs any shell command; auto-classifies output; returns compressed summary + `log_id`. |
| `smart_build` | optional `tool` (`gradle`/`npm`/`cargo`/`make`/`auto`), `args`, `cwd` | Auto-detects the build tool from `cwd` (gradlew, package.json, Cargo.toml, Makefile) and runs it through the matching compressor. |
| `smart_test` | optional `framework` (`jest`/`pytest`/`junit`/`go`/`auto`), `pattern`, `cwd` | Auto-detects the test framework from `cwd` (go.mod, pytest.ini/pyproject, package.json jest/vitest, gradlew) and runs it. |
| `read_log_section` | `log_id`, optional `grep`, `lines_around`, `start_line`/`end_line`, `max_tokens` | Retrieves a slice of a cached full log. Use when the compressed view isn't enough. |

Every compressed response ends with:

```
---
[Compressed from ~15,234 tokens → ~1,847 tokens (87.9% reduction)]
[Full log cached as log_id="grd_abc123". Use read_log_section to query details.]
```

## Benchmark

Measured on the synthetic fixtures in `test/fixtures/` (token counts via the chars/4 heuristic; real-world 12–20k-token logs compress substantially more):

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

## What each compressor keeps / drops

### Gradle (`./gradlew …`)
- **Keep:** BUILD status + duration, every Kotlin/javac error with `file:line:col`, deduped warnings with occurrence counts (`[×3]`), failing task name, "What went wrong" block
- **Drop:** `> Task :xxx UP-TO-DATE/NO-SOURCE`, `Download …` progress, Daemon startup chatter

### npm / yarn / pnpm
- **Keep:** `npm ERR!` blocks with error code, `added X packages` changes, deduped deprecations (per package, top 10), audit severity summary, actionable peer-dep warnings
- **Drop:** duplicate deprecation lines (collapsed), download progress, boilerplate "run npm audit" text

### Jest / Vitest
- **Keep:** `Test Suites:` / `Tests:` / `Time:` summary, every `● Test › name` failure block with assertion diff
- **Drop:** `PASS src/…` per-suite names (collapsed to count), duplicated "Summary of all failing tests" block

### Pytest
- **Keep:** platform/version header, `ERRORS:` + `FAILURES:` blocks verbatim, `short test summary info` (FAILED locators), final result line
- **Drop:** progress-dot lines (`tests/foo.py ...... [10%]`), rootdir/plugins chatter

### JUnit (Gradle/Maven test)
- **Keep:** each `FAILED` test with FQCN, assertion message, app stack frames, total count
- **Drop:** `PASSED` test names (collapsed to count), framework frames (`org.junit.*`, `java.base/jdk.internal.*`, `kotlinx.coroutines.internal.*`, `android.os.*`, reflection)

### Generic (fallback)
- **Keep:** every line matching `/error|fail|exception|fatal|panic/i`
- **Drop/transform:** consecutive identical lines deduped, middle-truncated if over budget (head 30% + tail 50%)

## FAQ

**What if the compressor drops something I need?**
Every response includes `log_id="…"`. Call `read_log_section` with a `grep` pattern or `start_line`/`end_line` to pull the raw detail. The full log is on disk (`~/.cache/claude-log-compressor/`) for 7 days.

**Does it work on Windows?**
WSL works. Native Windows is not in the MVP — see SPEC §4 out-of-scope.

**Does it call any external service or send data anywhere?**
No. Commands run locally, full logs live on your disk, nothing phones home.

**Why not just tell Claude to pipe through `head`/`grep`?**
Claude still sees the raw output before filtering because bash-tool results go into context. Compressing server-side is the only way to keep the raw bytes out of the context window.

**Will Claude actually use `smart_build` instead of `bash gradle build`?**
With the CLAUDE.md snippet above, adherence is high. Tool descriptions also say "ALWAYS prefer this over bash for builds/installs/tests". The model can't be forced, but in practice it routes correctly once nudged.

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

Layout, conventions, and milestones: see [`CLAUDE.md`](./CLAUDE.md).
Spec: [`SPEC.md`](./SPEC.md) (authoritative) and [`spec-overview.md`](./spec-overview.md) (pitch/roadmap).

## License

MIT
