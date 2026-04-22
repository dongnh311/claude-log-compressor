# Claude Context Saver — Implementation Spec

> An MCP server that dramatically reduces token consumption for Claude Code users. Ships two cooperating capabilities in one package:
>
> 1. **Log compression** — intercepts build/test/install commands and returns compressed summaries instead of raw multi-thousand-token output.
> 2. **Smart file reading** — reads source files at the semantic level (symbols, functions, classes) so Claude only ingests the code it actually needs instead of whole 2000-line files.
>
> **Package name:** `claude-context-saver`
> **Repo:** `github.com/<owner>/claude-context-saver`
> **License:** MIT
> **Target audience:** Claude Code Pro-tier users hitting context/rate limits during real coding sessions.

---

## 1. Context & Goal

### Problem

Two dominant sources of wasted tokens in a Claude Code session:

1. **Noisy command output** — `gradle build`, `npm install`, `pytest`, etc. can emit 5k–20k tokens per invocation, mostly progress bars, deprecation warnings, and framework noise.
2. **Whole-file reads for narrow questions** — Claude reads a 2,000-line `MainActivity.kt` to fix one function, or scans a 1,500-line `AuthService.java` to understand one method. The whole file goes into context; 90% is irrelevant.

### Solution

One MCP server exposing two families of tools:

- **Log family** — `smart_run`, `smart_build`, `smart_test`, `read_log_section`. Execute commands, compress output by type, cache full logs on disk, expose a retrieval tool for deeper inspection.
- **File family** — `smart_read`, `list_symbols`, `read_symbol`, `find_references_in_file`, `read_lines`. Parse source files into AST-backed symbol maps and return only the requested slices.

Both families share one design principle: **don't let raw, unfiltered content into Claude's context; let Claude pull exactly what it needs**.

### Non-goals

- Not a language server, type checker, or code intelligence platform. No cross-file type resolution, no go-to-definition across files.
- Not a semantic search / embedding / RAG system. Purely syntactic (AST) analysis.
- Does not route requests to cheaper models.
- Does not replace all bash or Read tool usage — only wins where raw content is dramatically larger than what Claude actually needs.

---

## 2. Success Criteria

1. `npx claude-context-saver install` registers the server in Claude Code with one command.
2. **Log side**: on a real Android Gradle project, `smart_build` returns ≤ 15% of the original token count while preserving 100% of error signals.
3. **File side**: on a Kotlin file of ≥ 1000 lines, `smart_read` with a focus returns ≤ 20% of the tokens of a full `Read`, while giving Claude enough detail for targeted questions.
4. Supports Kotlin, Java, TypeScript/TSX, JavaScript/JSX, Python, Go, Rust, Swift in the MVP via tree-sitter grammars.
5. Graceful fallback: unparseable or unsupported files degrade to line-range chunking, never hard-fail.
6. Works on macOS, Linux, and Windows (WSL acceptable for Windows in v0.2).
7. Zero-config for common cases; project-level `.claude-context-saver.toml` for overrides.

---

## 3. Architecture

```
┌─────────────┐      stdio/JSON-RPC       ┌──────────────────────────────┐
│ Claude Code │ ────────────────────────► │  MCP Server (Node)           │
└─────────────┘                           │                              │
     ▲                                    │  ┌─────────────────────────┐ │
     │   compressed output /              │  │  Tool router            │ │
     │   symbol slice                     │  └───┬────────────┬────────┘ │
     │                                    │      │            │          │
     │                                    │  ┌───▼──────┐ ┌───▼────────┐ │
     │                                    │  │ log-side │ │ file-side  │ │
     │                                    │  │          │ │            │ │
     │                                    │  │ executor │ │tree-sitter │ │
     │                                    │  │ classify │ │  parser    │ │
     │                                    │  │ compress │ │ symbol idx │ │
     │                                    │  │ cache    │ │ chunker    │ │
     │                                    │  └──────────┘ └────────────┘ │
     │                                    │                               │
     │                                    │  shared: disk cache, config,  │
     │                                    │          tokens, types        │
     │                                    └──────────────────────────────┘
```

---

## 4. Tech Stack

- **Language:** TypeScript (strict mode).
- **Runtime:** Node.js ≥ 18.
- **MCP SDK:** `@modelcontextprotocol/sdk` (latest stable).
- **Parser:** `web-tree-sitter` (WASM) with bundled grammar `.wasm` files. Chosen over native tree-sitter because native bindings require `node-gyp` which breaks on user machines. WASM is ~2x slower but parsing 2000-line files is still < 50ms — irrelevant vs. Claude round-trip.
- **Process execution:** Node's `child_process.spawn` (NOT `exec` — streaming needed for large outputs).
- **Testing:** `vitest`.
- **Build:** `tsc`. No bundler.
- **Lint/format:** `biome`.

**No other runtime dependencies for the MVP.** Node stdlib covers everything else.

---

## 5. File Structure

```
claude-context-saver/
├── package.json
├── tsconfig.json
├── biome.json
├── README.md
├── LICENSE
├── .gitignore
├── .npmignore
├── src/
│   ├── index.ts                       # Shebang entry, starts server over stdio
│   ├── server.ts                      # MCP server setup, tool registration
│   ├── config.ts                      # Loads .claude-context-saver.toml if present
│   ├── tokens.ts                      # Rough token estimation (chars/4 for MVP)
│   ├── types.ts                       # Shared types
│   │
│   ├── log-side/
│   │   ├── tools/
│   │   │   ├── smart-run.ts
│   │   │   ├── smart-build.ts
│   │   │   ├── smart-test.ts
│   │   │   └── read-log-section.ts
│   │   ├── executor.ts                # spawn wrapper with timeout + capture
│   │   ├── classifier.ts              # Detect output type from command/content
│   │   ├── log-cache.ts               # ~/.cache/claude-context-saver/logs/
│   │   └── compressors/
│   │       ├── index.ts               # Registry + dispatcher
│   │       ├── gradle.ts
│   │       ├── npm.ts
│   │       ├── generic.ts
│   │       ├── jest.ts
│   │       ├── pytest.ts
│   │       └── junit.ts
│   │
│   ├── file-side/
│   │   ├── tools/
│   │   │   ├── smart-read.ts
│   │   │   ├── list-symbols.ts
│   │   │   ├── read-symbol.ts
│   │   │   ├── find-references.ts
│   │   │   └── read-lines.ts
│   │   ├── parser.ts                  # tree-sitter wrapper
│   │   ├── language-registry.ts       # ext → grammar mapping
│   │   ├── symbol-index.ts            # AST → Symbol[]
│   │   ├── chunker.ts                 # Oversized symbol handling
│   │   ├── formatter.ts               # Outline / focused-symbol text output
│   │   ├── fallback.ts                # Line-based when parse fails
│   │   └── file-cache.ts              # LRU + disk symbol cache
│   │
│   ├── grammars/
│   │   ├── wasm/                      # Bundled .wasm files (~5MB total)
│   │   │   ├── tree-sitter-kotlin.wasm
│   │   │   ├── tree-sitter-java.wasm
│   │   │   ├── tree-sitter-typescript.wasm
│   │   │   ├── tree-sitter-javascript.wasm
│   │   │   ├── tree-sitter-python.wasm
│   │   │   ├── tree-sitter-go.wasm
│   │   │   ├── tree-sitter-rust.wasm
│   │   │   └── tree-sitter-swift.wasm
│   │   └── queries/
│   │       ├── kotlin.scm
│   │       ├── java.scm
│   │       ├── typescript.scm
│   │       ├── javascript.scm
│   │       ├── python.scm
│   │       ├── go.scm
│   │       ├── rust.scm
│   │       └── swift.scm
│   │
│   └── install/
│       └── install-command.ts         # `npx claude-context-saver install`
│
├── test/
│   ├── fixtures/
│   │   ├── logs/
│   │   │   ├── gradle-android-success.log
│   │   │   ├── gradle-android-compile-err.log
│   │   │   ├── npm-install-large.log
│   │   │   ├── jest-100-tests-3-fail.log
│   │   │   └── ...
│   │   └── sources/
│   │       ├── AuthViewModel.kt       # Hero Kotlin fixture, ~850 lines
│   │       ├── UserService.java
│   │       ├── api.ts
│   │       ├── views.py
│   │       ├── handler.go
│   │       ├── parser.rs
│   │       └── ViewController.swift
│   ├── log-side/
│   │   ├── compressors.test.ts
│   │   ├── executor.test.ts
│   │   └── classifier.test.ts
│   └── file-side/
│       ├── parser.test.ts
│       ├── symbol-index.test.ts
│       ├── smart-read.test.ts
│       └── chunker.test.ts
│
└── scripts/
    └── benchmark.ts                   # Generate the README benchmark tables
```

### `package.json` key fields

```json
{
  "name": "claude-context-saver",
  "version": "0.1.0",
  "description": "MCP server that cuts Claude Code token usage via log compression and semantic file reading",
  "type": "module",
  "bin": {
    "claude-context-saver": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build",
    "dev": "tsx src/index.ts",
    "test": "vitest",
    "bench": "tsx scripts/benchmark.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "web-tree-sitter": "^0.22.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tsx": "^4.0.0",
    "@types/node": "^20.0.0",
    "vitest": "^1.0.0",
    "@biomejs/biome": "^1.0.0"
  },
  "engines": { "node": ">=18" },
  "keywords": ["mcp", "claude", "claude-code", "token-optimization", "tree-sitter"],
  "license": "MIT"
}
```

---

## 6. Tool Specifications

### 6.1 Log-side tools

#### `smart_run`
Generic command runner with output compression.

**Input:**
```json
{
  "command": "string (required)",
  "cwd": "string (optional, default = process.cwd())",
  "timeout_seconds": "number (optional, default = 300)",
  "max_output_tokens": "number (optional, default = 2000)"
}
```

#### `smart_build`
Dispatches to the right build-tool compressor.

**Input:**
```json
{
  "tool": "string (optional: 'gradle' | 'npm' | 'cargo' | 'make' | 'auto', default = 'auto')",
  "args": "string (optional)",
  "cwd": "string (optional)"
}
```

#### `smart_test`
Runs tests and returns only failures + summary.

**Input:**
```json
{
  "framework": "string (optional: 'junit' | 'jest' | 'pytest' | 'go' | 'auto', default = 'auto')",
  "pattern": "string (optional)",
  "cwd": "string (optional)"
}
```

#### `read_log_section`
Retrieves a slice of a cached full log.

**Input:**
```json
{
  "log_id": "string (required)",
  "grep": "string (optional)",
  "lines_around": "number (optional, default = 3)",
  "start_line": "number (optional)",
  "end_line": "number (optional)"
}
```

### 6.2 File-side tools

#### `smart_read`
High-level smart replacement for the Read tool.

**Input:**
```json
{
  "path": "string (required)",
  "focus": "string (optional, symbol name or regex to zoom into)",
  "mode": "string (optional: 'outline' | 'full' | 'auto', default = 'auto')",
  "max_tokens": "number (optional, default = 2000)"
}
```

**Behavior:**
- File ≤ 300 lines or ≤ 1500 tokens → return whole file.
- `mode='auto'` with no focus on a large file → return outline only.
- `focus` provided → outline + bodies of matching symbols.
- `mode='full'` → full file, truncated to `max_tokens` if needed.

#### `list_symbols`
Return the full symbol tree without bodies.

**Input:**
```json
{
  "path": "string (required)",
  "kinds": "array (optional, filter by kind)",
  "depth": "number (optional, 0=top-level, -1=all, default = -1)"
}
```

#### `read_symbol`
Return bodies of one or more named symbols.

**Input:**
```json
{
  "path": "string (required)",
  "names": "array of strings (required, dotted notation supported: 'AuthViewModel.login')",
  "include_surrounding": "boolean (optional, default = false)"
}
```

#### `find_references_in_file`
Find identifier occurrences within a single file.

**Input:**
```json
{
  "path": "string (required)",
  "identifier": "string (required)",
  "context_lines": "number (optional, default = 2)"
}
```

Not a cross-file search — Claude's grep already handles that. This one adds AST-aware "inside symbol" annotation.

#### `read_lines`
Line-range escape hatch. Always available.

**Input:** `{ path, start_line, end_line }`.

### 6.3 Output format (log side)

Consistent text format so Claude learns the pattern:

```
BUILD FAILED (2 errors, 14 warnings)

Errors:
  app/build.gradle.kts:45 — Unresolved reference: viewBinding
  MainActivity.kt:128 — Type mismatch: expected String, found Int?

Warnings (14 unique, showing top 3 by frequency):
  [x8] 'foo' is deprecated. Use 'bar' instead.
  [x4] Unused import: com.example.Baz
  [x2] Variable 'x' is never used

Final task: :app:compileDebugKotlin FAILED

---
[Compressed from ~15,234 tokens to ~1,847 tokens (87.9% reduction)]
[Full log cached as log_id="grd_abc123". Use read_log_section to query details.]
```

### 6.4 Output format (file side)

```
File: app/src/main/kotlin/com/example/AuthViewModel.kt
Language: Kotlin · 847 lines · ~6,214 tokens (full file)
Returning: outline + 2 focused symbols (~1,340 tokens, 78.4% reduction)

OUTLINE
---------------------------------------------------------
class AuthViewModel : ViewModel                     [L24-L842]
- companion object                                   [L26-L32]
- private val repository: UserRepository             [L35]
- private val _state: MutableStateFlow<AuthState>    [L37]
- val state: StateFlow<AuthState>                    [L38]
- fun login(email: String, password: String)         [L45-L98]     <- focused
- fun logout()                                       [L100-L115]
- fun refreshToken()                                 [L117-L162]   <- focused
- private suspend fun validateCredentials(...)       [L164-L203]
- ... (12 more symbols - use list_symbols for all)

FOCUSED SYMBOLS
---------------------------------------------------------
fun login(email: String, password: String) [L45-L98]
```kotlin
fun login(email: String, password: String) {
    viewModelScope.launch {
        _state.value = AuthState.Loading
        try {
            val result = repository.login(email, password)
            // ... (full body)
        } catch (e: Exception) {
            _state.value = AuthState.Error(e.message)
        }
    }
}
```

fun refreshToken() [L117-L162]
```kotlin
fun refreshToken() {
    // ... (full body)
}
```

---
[File cached as file_id="kt_7f3ab2c1"]
[Use list_symbols / read_symbol / read_lines for more detail]
```

---

## 7. Shared Infrastructure

### 7.1 Disk cache

Root: `~/.cache/claude-context-saver/`

- `logs/<log_id>.log` — full captured command outputs.
- `symbols/<file_id>.json` — parsed symbol tables, keyed by hash of `{path, mtime, size}`.
- `server.log` — diagnostic log. Server NEVER writes to stdout (stdout is MCP transport).

Auto-cleanup on server start: delete entries older than 7 days.

### 7.2 `file_id` / `log_id` convention

- `log_id = <tool-prefix>_<8-char-hash>` e.g. `grd_abc12345`. Prefix indicates compressor type.
- `file_id = <lang-prefix>_<8-char-hash>` e.g. `kt_7f3ab2c1`.

Always included in tool responses so Claude can reference them back.

### 7.3 Token estimation

`chars / 4` is accurate enough for MVP. Do not import a real tokenizer in v0.1 — dependency burden, and the estimate only drives internal decisions (whether to truncate). If users complain later, revisit.

### 7.4 Config file (optional, opt-in)

`.claude-context-saver.toml` in project root:

```toml
[log]
default_max_output_tokens = 2000
timeout_seconds = 600

[log.gradle]
keep_task_summary = true
dedupe_warnings = true

[file]
default_max_tokens = 2000
small_file_threshold_lines = 300

[file.language_overrides]
kotlin = { treat_as = "kotlin" }  # force grammar when ext is ambiguous
```

All fields optional; defaults apply. Parse once at server start; reload on file change.

---

## 8. Symbol Extraction

### 8.1 Interface

```typescript
type SymbolKind =
  | "class" | "interface" | "enum" | "object" | "struct" | "trait"
  | "function" | "method" | "constructor"
  | "property" | "field" | "const" | "type_alias"
  | "namespace" | "module";

interface Symbol {
  name: string;
  qualified_name: string;            // "AuthViewModel.login"
  kind: SymbolKind;
  signature: string;                 // "fun login(email: String, password: String)"
  modifiers: string[];               // ["public", "suspend"]
  doc: string | null;                // leading doc comment
  line_range: [number, number];
  byte_range: [number, number];
  children: Symbol[];
  parent_qualified_name: string | null;
}

interface ParsedFile {
  file_id: string;
  path: string;
  language: string | null;           // null if fallback
  line_count: number;
  token_estimate: number;
  symbols: Symbol[];                 // top-level; nested via .children
  parse_status: "ok" | "partial" | "failed";
  parse_errors: string[];
}
```

### 8.2 Tree-sitter queries

Each language has a query file in `src/grammars/queries/<lang>.scm`. Example Kotlin pattern for functions:

```scheme
(function_declaration
  (modifiers)? @modifiers
  name: (simple_identifier) @name
  (function_value_parameters) @params
  (user_type)? @return_type
  body: (_)? @body
) @function
```

Extract for each language:
- Top-level declarations (class, interface, enum, object, struct, trait, fn, type alias, const).
- Nested declarations (methods, nested classes, companion objects).
- Properties/fields with types.
- Function signatures (name, typed params, return type).
- Modifiers (public, private, suspend, static, async, ...).
- Doc comments immediately preceding a symbol.

### 8.3 Oversized symbol handling

If a single symbol body exceeds `max_tokens / 2`, don't return it whole. Instead:

1. Signature + doc.
2. Structural outline of the body (nested blocks, loops, branches with line ranges).
3. Hint to use `read_lines` for specifics.

Example:

```
fun processTransaction(...): Result [L245-L764]

Body outline (520 lines):
- [L246-L260] validation block
- [L262-L310] when(transaction.type) { ... }
  - [L264-L278] case Type.DEPOSIT
  - [L280-L295] case Type.WITHDRAWAL
  - [L297-L309] case Type.TRANSFER
- [L312-L450] try { ... main processing ... }
  - [L330-L380] nested fn: buildRequest(...)
  - [L382-L448] nested fn: applyRules(...)
- [L452-L680] catch blocks (4)
- [L682-L763] finally + logging

Use read_lines(path, start, end) to zoom in on any range.
```

### 8.4 Fallback ladder

In order:

1. Tree-sitter parse succeeds → symbol-based response.
2. Parse fails or language unsupported → line-based chunking (first 50 + last 50 lines for large files; full content for ≤ 300 lines).
3. File is binary (heuristic: null byte in first 8KB) or > 10MB → refuse with clear message.

Never throw an unhandled exception from a tool handler.

---

## 9. Claude Code Adoption Strategy

### 9.1 Two install paths

**Option A — Config file (manual):**

User adds to `~/.claude/mcp.json` (or project-local `.claude/mcp.json`):

```json
{
  "mcpServers": {
    "context-saver": {
      "command": "npx",
      "args": ["-y", "claude-context-saver"]
    }
  }
}
```

**Option B — One-liner install (preferred):**

```bash
npx claude-context-saver install
```

Detects Claude Code config location (global first, then project), adds entry if missing, prints next steps. Idempotent — running twice is fine.

### 9.2 Tool descriptions (the critical lever)

Model priors favor built-in tools (`bash`, `Read`). We override this with explicit tool descriptions:

```
smart_build: Run a build command with automatic output compression.
ALWAYS prefer this over running gradle/npm/cargo via bash - it returns
the same information in 5-10x fewer tokens, preserving all errors and
warnings while stripping noise. Use bash only if this tool fails.
```

```
smart_read: Read a source code file intelligently. For source files
larger than ~300 lines, PREFER this over the standard Read tool - it
returns a symbol outline first, letting you zoom in on only the
functions/classes you actually need. Typical savings: 70-90% fewer
tokens vs. whole-file reads. Supports Kotlin, Java, TypeScript,
JavaScript, Python, Go, Rust, Swift. Falls back to line-based reading
for unsupported file types.
```

### 9.3 CLAUDE.md snippet (shipped in README)

Document a project-level CLAUDE.md addition users can drop in:

```markdown
## Token-efficient tooling (claude-context-saver MCP)

- Build/test: use `smart_build` and `smart_test` instead of invoking
  gradle/npm/jest/pytest via bash.
- File reading: for source files in src/ (Kotlin, TS, Java, etc.),
  prefer `smart_read` over `Read`. Use `list_symbols` to survey a file,
  then `read_symbol` to fetch specific functions. Use `Read` only for
  config files, markdown, or files smaller than ~300 lines.
- If a `smart_*` tool fails, fall back to bash/Read.
```

---

## 10. Milestones

### Phase 1 — Log side (weeks 1-2, ship as v0.1.0)

#### M1: Scaffolding (day 1)
- [ ] Init npm package, tsconfig, biome, gitignore, npmignore.
- [ ] Install `@modelcontextprotocol/sdk`.
- [ ] Minimal `src/index.ts` starts MCP server over stdio with zero tools.
- [ ] Verify with `npx @modelcontextprotocol/inspector`.
- [ ] `"bin"` field wired so `node dist/index.js` works after build.

#### M2: Executor + generic compressor + `smart_run` (days 2-3)
- [ ] `executor.ts`: spawn with timeout, capture stdout+stderr, strip ANSI, return `{stdout, stderr, exitCode, durationMs}`.
- [ ] `log-cache.ts`: write full logs, 7-day cleanup.
- [ ] `compressors/generic.ts`: dedupe consecutive lines, preserve error-matching lines, middle-truncate.
- [ ] `tools/smart-run.ts`: wire executor -> compressor -> formatted output.
- [ ] Tests.

#### M3: Gradle compressor (days 4-5)
- [ ] `compressors/gradle.ts`: BUILD status, errors with file:line, deduped warnings, final task.
- [ ] Fixtures from a real Android project (success + 4 failure modes).
- [ ] `tools/smart-build.ts` with auto-detection (`build.gradle*` / `gradlew` present).
- [ ] Benchmark on fixtures.

#### M4: npm + test compressors (days 6-8)
- [ ] `compressors/npm.ts`.
- [ ] `compressors/jest.ts`, `compressors/pytest.ts`, `compressors/junit.ts`.
- [ ] `tools/smart-test.ts` with auto-detection.

#### M5: `read_log_section` (day 9)
- [ ] Grep with context lines.
- [ ] Line-range read.
- [ ] Token-bounded slice (default 2000 max).

#### M6: Install command + README + release (days 10-12)
- [ ] `install/install-command.ts`: `npx claude-context-saver install`.
- [ ] README with 30-second pitch, benchmark table, install instructions, FAQ.
- [ ] GitHub Actions CI: tests on macOS + Linux, Node 18/20/22.
- [ ] `npm publish --dry-run` then `npm publish --access public`.
- [ ] Tag `v0.1.0`.

#### M7: Real-world integration test (days 13-14)
- [ ] Configure locally, run a realistic Android session.
- [ ] Measure actual token usage before/after.
- [ ] Fix surfaced issues.

**Stop here. Ship v0.1.0. Get feedback. Then continue.**

### Phase 2 — File side (weeks 3-4, ship as v0.2.0)

#### M8: Tree-sitter plumbing (days 15-16)
- [ ] Add `web-tree-sitter` dependency.
- [ ] Bundle 8 grammar `.wasm` files in `src/grammars/wasm/`.
- [ ] `language-registry.ts`: ext -> grammar, lazy load.
- [ ] `parser.ts`: `{path, source}` -> tree.
- [ ] Unit test: parse one fixture per language, assert root exists.

#### M9: Symbol extraction — Kotlin + TypeScript first (days 17-19)
- [ ] Write `queries/kotlin.scm` and `queries/typescript.scm`.
- [ ] `symbol-index.ts`: query -> `Symbol[]` with ranges, modifiers, signatures, nested children.
- [ ] Test against `AuthViewModel.kt` and `api.ts` fixtures.

#### M10: `list_symbols` and `read_symbol` (days 20-21)
- [ ] Tool handlers.
- [ ] `file-cache.ts`: LRU + disk persistence keyed by `{path, mtime, size}`.
- [ ] Dotted name resolution (`AuthViewModel.Companion.foo`).
- [ ] Tests.

#### M11: `smart_read` + formatter (days 22-23)
- [ ] `formatter.ts`: outline / focused-symbol text output.
- [ ] `tools/smart-read.ts`: mode resolution, focus matching, token budgeting.
- [ ] `chunker.ts`: oversized symbol handling.
- [ ] Integration test on `AuthViewModel.kt`.

#### M12: Remaining languages + fallback + `find_references_in_file` (days 24-26)
- [ ] Queries for Java, JavaScript, Python, Go, Rust, Swift.
- [ ] `fallback.ts`: line-based chunking.
- [ ] `tools/find-references.ts` with AST-aware "inside symbol" annotation.
- [ ] `tools/read-lines.ts`.

#### M13: Polish & release v0.2.0 (days 27-28)
- [ ] Update benchmark table with file-side numbers.
- [ ] `install` command remains backward-compatible (existing v0.1 users get new tools on upgrade).
- [ ] Demo: before (full Read of 900-line Kotlin) vs. after (smart_read with focus).
- [ ] `npm publish`, tag `v0.2.0`.

### Phase 3 — Post-launch (ongoing)

Config file support fully wired, more test compressors (Cargo, Maven, Go test, .NET), Windows native (non-WSL), web dashboard for inspecting cached logs. Driven by user feedback after v0.2.0.

---

## 11. Testing Strategy

### Unit tests
- Each compressor: fixture -> assert signals kept, noise dropped.
- Executor: timeout, exit code propagation, large output.
- Cache: write, read, expiry.
- Parser per language: parse fixture, assert root node and top-level symbol count.
- Symbol index: assert expected symbols with correct ranges.

### Integration tests
- Spawn MCP server as subprocess, send JSON-RPC, assert responses.
- Use `@modelcontextprotocol/sdk` client utilities.

### Manual validation
- Use a real project as a test bed (swap in before publishing).
- Before/after token measurements.

### Benchmark output (goes in README)

**Log side:**

```
Fixture                            Original    Compressed  Reduction
gradle-android-success.log         14,832      892         94.0%
gradle-android-compile-err.log     16,214      1,643       89.9%
npm-install-large.log              8,421       412         95.1%
jest-100-tests-3-fail.log          22,103      1,284       94.2%
pytest-200-tests-5-fail.log        18,470      1,098       94.1%
```

**File side:**

```
Language    Fixture                        Full     smart_read  Reduction
Kotlin      AuthViewModel.kt (847 L)       6,214    1,340       78.4%
Java        UserService.java (612 L)       4,890    1,120       77.1%
TypeScript  api.ts (780 L)                 5,430    980         82.0%
Python      views.py (450 L)               3,210    820         74.5%
Go          handler.go (390 L)             2,980    760         74.5%
Rust        parser.rs (520 L)              4,100    920         77.6%
Swift       ViewController.swift (680 L)   5,020    1,060       78.9%
```

---

## 12. Code Style Rules

- TypeScript strict mode. No `any` unless commented with justification.
- Brute force first, readable over clever. No fancy functional chains when a `for` loop is clearer.
- All comments in English only.
- No runtime dependencies beyond `@modelcontextprotocol/sdk` and `web-tree-sitter`. Node stdlib covers the rest.
- Every tool handler wraps its body in try/catch; never let an exception crash the server.
- Diagnostic logs go to `~/.cache/claude-context-saver/server.log`, NEVER to stdout.
- Paths: always resolve to absolute early; always stat before parsing/reading.

---

## 13. Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Claude ignores `smart_*` and uses built-in tools anyway | Strong tool descriptions; ship a CLAUDE.md snippet in README; measure adherence in manual tests |
| Compressor drops a critical line | `read_log_section` escape hatch; always preserve lines matching error patterns; include `log_id` in every response |
| Gradle output format varies across versions | Fixtures from Gradle 7.x and 8.x; classify by sniffing version banner |
| ANSI color codes pollute compressed output | Strip ANSI in executor before compressor sees it |
| Long builds hit timeout | Configurable timeout; streaming in Phase 3 |
| Disk cache grows unbounded | 7-day auto-cleanup on server start |
| tree-sitter grammar lags newest language syntax | Pin grammar versions; fall back to line-based on parse error |
| Symbol outline misses a top-level `val` / import user needed | Outline must include imports and top-level declarations, not just classes |
| `find_references_in_file` false positives in comments/strings | AST-filter: keep identifier nodes only |
| Stale symbol cache after external edit | Key cache by `{path, mtime, size}`; revalidate every call |
| WASM load latency on first call per language | Lazy-load per language; cache warm Parser instance |
| Symlinks / exotic filesystems | Resolve to absolute paths early; stat before parsing; meaningful error messages |

---

## 14. Open Questions — Resolve Before Starting

Ask the project owner and confirm before writing code:

1. **Package name availability** — run `npm view claude-context-saver`. If taken, fall back to `@<owner>/claude-context-saver` (scoped).
2. **GitHub org/user** — personal repo or an org?
3. **Swift grammar in MVP** — Swift tree-sitter grammar is community-maintained and sometimes lags. Ship as best-effort in v0.2 or defer to Phase 3?
4. **`preview_edit` tool** — given a proposed edit, return only ±20 lines of affected symbols so Claude can sanity-check without re-reading the file. MVP or Phase 3?
5. **Telemetry** — none for v0.1/v0.2. Opt-in only if added later.

---

## 15. First Deliverable Checkpoints

After **M2**, the following end-to-end flow must work:

1. User installs MCP server via `npx claude-context-saver install`.
2. User asks Claude to run `npm install` in a directory.
3. Claude calls `smart_run` with `command: "npm install"`.
4. Server runs it, generic compressor compresses, returns summary + `log_id`.
5. Claude sees compressed output; can request details via `read_log_section`.

After **M11**, the equivalent checkpoint for the file side:

1. User asks Claude "explain the login flow in AuthViewModel.kt" on an 800+ line file.
2. Claude calls `smart_read` with `path` and `focus: "login"`.
3. Server returns outline + `login` body (~1.3k tokens instead of ~6k).
4. Claude answers the question without ever ingesting the full file.

---

## 16. Execution Instructions for Claude Code

When implementing this spec:

- **Work milestone by milestone.** Commit after each milestone. Do not start M(n+1) until M(n) tests pass and are committed.
- **Stop and ask before each milestone transition.** Show the owner: what was built, what tests pass, what's next.
- **Do not invent new tools or scope creep.** If a need emerges, add it to the "Open Questions" list and ask.
- **Resolve Section 14 questions before starting M1.**
- **Fixtures are part of the deliverable.** Don't mock — use realistic fixtures captured from real projects (with secrets scrubbed).
- **Every tool handler must have a unit test AND an integration test (subprocess MCP call).**
- **When uncertain about tree-sitter query syntax for a language, check the grammar's `queries/` folder in its GitHub repo for examples before guessing.**
