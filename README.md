# smart-log-compress-mcp

> MCP server that compresses tool output (build logs, test results, stack traces, install logs) **before** it enters Claude's context — cutting token usage by 80%+ on typical developer workflows.

## Why

When using Claude Code on real projects:

- `gradle build` output: 10k–20k tokens, 90% is noise (progress, duplicate warnings)
- `npm install`: 5k–15k tokens, mostly repeated deprecation notices
- `pytest -v`: passed-test verbose log dominates; the signal is in failed tests
- Android stack traces: 50–100 frames, of which only 3–5 are app code

Result: context window fills fast, Pro 5-hour limit hits early, prompt cache hit rate drops, Claude's attention gets diluted by log noise.

## How it works

Instead of having Claude call `bash` directly, Claude calls tools exposed by this MCP server. The server runs the command, captures the full output, classifies it, applies a type-specific compressor, and returns only a compact summary to Claude. The full log is cached on disk and can be pulled back on demand via `get_full_output`.

```
[Claude] → smart_run("gradle build")
            ↓
       [MCP server]
            ↓
       run command → 15k tokens raw output
            ↓
       classify (build / test / install / stacktrace / generic)
            ↓
       type-specific compressor
            ↓
       cache full log → /tmp/claude-logs/<id>.log (TTL 24h)
            ↓
       return 1.5k token summary + reference id
            ↑
[Claude] ← summary
```

## Status

Early development. Spec and scope: see `spec.md`.

## License

MIT
