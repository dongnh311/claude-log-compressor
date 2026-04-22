# Launch copy — ready to paste

All posts drafted against the v0.1.0 release. Tweak channel-appropriate tone before sending.

---

## Show HN

**Title (80 char limit):**
```
Show HN: MCP server that cuts Claude Code's context use by 90% on build logs
```

Alt title options:
- `Show HN: Compress gradle/npm/pytest logs before they reach Claude's context`
- `Show HN: Claude-Log-Compressor – 93% token reduction on real Android builds`

**Body:**
```
Hi HN,

I use Claude Code a lot on Android projects. Every `gradle build` dumps 10–20k
tokens into the context — 90% of which is `> Task :xxx UP-TO-DATE`, download
URLs, and configure chatter. That burns the Pro 5-hour limit and fills the
context window way before the real work is done.

claude-log-compressor is an MCP server that intercepts build/test/install
commands, runs them, classifies the output (gradle / npm / jest / pytest /
junit / generic), applies a type-specific compressor, caches the full log to
disk, and returns only a compact summary. Claude never sees the raw noise.

Measured live on a real Android Compose + C++/NDK project:

  clean :app:assembleDebug      2,090 → 82   tokens  (96.1%)
  clean :app:assembleRelease    2,720 → 82   tokens  (97.0%)
  :app:compileDebugKotlin       667 → 114   tokens  (82.9%)
                                (with both compile errors preserved at file:line:col)
  :app:installDebug             955 → 3     tokens  (99.7%)

Every response ends with a log_id so Claude can call `read_log_section` with
a grep pattern when the summary isn't enough — nothing is actually discarded,
just hidden.

Stack: TypeScript, Node ≥ 18, ESM. Single runtime dep (the MCP SDK) — ANSI
stripping, token estimation, process spawn are all Node stdlib. Distributes
via `npx claude-log-compressor@latest`.

Install in Claude Code (add to ~/.claude/mcp.json):

    {
      "mcpServers": {
        "log-compressor": {
          "command": "npx",
          "args": ["-y", "claude-log-compressor@latest"]
        }
      }
    }

Repo: https://github.com/dongnh311/claude-log-compressor
npm:  https://www.npmjs.com/package/claude-log-compressor

Happy to take feedback — especially from people running this on non-Android
stacks (I benchmarked Jest/Pytest/JUnit on synthetic fixtures but not live
projects yet).
```

---

## r/ClaudeAI

**Title:**
```
[Tool] I shipped an MCP server that cuts Claude Code's context use by ~90% on build/test/install logs
```

**Body:**
```
TL;DR — when Claude Code runs `gradle build`, `npm install`, `pytest`, etc.,
the raw output burns thousands of tokens. Most of it is noise. I built an MCP
server that runs the command for Claude, compresses the output (preserving
all errors/warnings), caches the full log on disk, and returns only a summary.

**Real numbers (live on a real Android project, not synthetic):**

| Command | Raw tokens | Compressed | Reduction |
|---|---|---|---|
| clean :app:assembleDebug | 2,090 | 82 | 96.1% |
| clean :app:assembleRelease | 2,720 | 82 | 97.0% |
| compileDebugKotlin (2 errors) | 667 | 114 | 82.9% |
| installDebug → emulator | 955 | 3 | 99.7% |

All errors/warnings preserved with `file:line:col`. Full log cached for
`read_log_section` retrieval.

**Tools exposed:** `smart_run`, `smart_build`, `smart_test`, `read_log_section`.
Auto-detects gradle/npm/cargo/make for builds and jest/vitest/pytest/junit/go
for tests.

**Install:**

```json
{
  "mcpServers": {
    "log-compressor": {
      "command": "npx",
      "args": ["-y", "claude-log-compressor@latest"]
    }
  }
}
```

Add a line to your project's CLAUDE.md telling the model to prefer `smart_*`
over bash for noisy commands and it just works.

Repo: https://github.com/dongnh311/claude-log-compressor
npm: https://www.npmjs.com/package/claude-log-compressor
MIT. Feedback/PRs welcome.
```

---

## Anthropic Discord (#mcp or #showcase)

**Message:**
```
Hey folks — shipped `claude-log-compressor`, an MCP server that compresses
gradle/npm/jest/pytest/junit output before it reaches Claude's context.

Live numbers on a real Android Compose+C++ project:
• clean :app:assembleDebug — 2,090 → 82 tokens (96.1% ↓)
• clean :app:assembleRelease — 2,720 → 82 tokens (97.0% ↓)
• compile error — 667 → 114 tokens (82.9% ↓), both errors preserved with file:line:col
• installDebug — 955 → 3 tokens (99.7% ↓)

All errors/warnings kept; full log cached on disk, `read_log_section` tool
lets Claude grep back into it.

One npm install, one ~/.claude/mcp.json entry:
    { "mcpServers": { "log-compressor": { "command": "npx",
      "args": ["-y", "claude-log-compressor@latest"] } } }

Repo: https://github.com/dongnh311/claude-log-compressor
npm: https://www.npmjs.com/package/claude-log-compressor

Would love feedback — especially anyone running big monorepo builds where the
raw logs are 20k+ tokens. The compression ratio scales with input size.
```

---

## Dev.to / Medium blog post skeleton

**Title:** `How I cut Claude Code's context usage by 93% on Android builds`

**Outline:**
1. The pain — "I kept hitting the Pro 5-hour limit mid-refactor. Here's why."
2. The diagnosis — token audit of a typical gradle build output
3. The architecture — MCP proxy pattern with type-specific compressors
4. The code — ~800 LoC TypeScript, single dep (MCP SDK)
5. The numbers — live benchmark table on MasterCamera
6. What I'd do differently — limits of chars/4 token estimation, future tiktoken swap
7. Try it — `npx claude-log-compressor@latest` + config snippet

---

## Twitter/X thread (280-char chunks)

1/  Built an MCP server that cuts Claude Code's context usage by ~90% on build/test logs. Live on a real Android project: `clean :app:assembleDebug` went from 2,090 tokens → 82. Full errors/warnings preserved. 🧵

2/  How: instead of letting Claude run `gradle build` via bash (raw output floods the context), it calls `smart_build`. The MCP server runs the command, classifies the output, compresses it, caches the full log, returns a summary + log_id.

3/  Supported today: gradle, npm, jest, pytest, junit, generic. Auto-detects from cwd (gradlew / package.json / pytest.ini / etc). Zero runtime deps besides @modelcontextprotocol/sdk — everything else is Node stdlib.

4/  Install:
npx claude-log-compressor@latest

Or add to ~/.claude/mcp.json. Works in Claude Code immediately — tools show up as `smart_run`, `smart_build`, `smart_test`, `read_log_section`.

5/  Repo + npm:
https://github.com/dongnh311/claude-log-compressor
https://www.npmjs.com/package/claude-log-compressor

MIT. Especially want feedback from folks on big monorepos where the raw logs are 20k+ tokens — compression ratio scales with input size. /end

---

## Key points to emphasize regardless of channel

- **Real numbers, not synthetic.** Measurements on MasterCamera, a real Compose+C++ Android project.
- **Zero signal loss.** Every error/warning with file:line:col is kept. Full log cached on disk for grep retrieval.
- **Minimal surface area.** One runtime dep. ~800 LoC. Stdlib-only philosophy.
- **Install in 30 seconds.** Single JSON snippet in `~/.claude/mcp.json`.
- **MIT, open source, PRs welcome.**

## What NOT to emphasize (over-promises)

- Don't claim 90%+ on all workloads — small or info-dense logs compress less.
- Don't promise Windows native — WSL only for now.
- Don't claim exact tokenization — chars/4 heuristic is ~15% off real tiktoken counts.
