# Smart Log Compress MCP

> MCP server giúp giảm token cho Claude Code bằng cách nén tool output (build log, test result, stack trace...) **trước khi** output đi vào context của Claude.

## 1. Vấn đề

Khi dùng Claude Code với các project thực tế:

- `gradle build` output: 10k–20k token, 90% là rác (progress, duplicate warnings)
- `npm install` output: 5k–15k token, hầu hết là deprecation notices lặp
- `pytest -v` output: verbose log của passed test chiếm phần lớn, thông tin hữu ích chỉ ở failed test
- Stack trace Android: 50–100 frame, trong đó code app chỉ 3–5 frame

Hậu quả:

- Context window đầy nhanh → user phải `/clear` hoặc `/compact` giữa chừng
- Gói Pro hit 5-hour limit sớm
- Prompt caching hit rate thấp do context thay đổi liên tục
- Claude bị loãng attention khi phải đọc log rác

## 2. Giải pháp: MCP proxy có filter

Thay vì để Claude tự chạy command bằng `bash`, Claude gọi các tool của MCP server. MCP chạy command, nhận full output, nén tại server, chỉ trả về bản rút gọn cho Claude.

```
[Claude] → gọi smart_run("gradle build")
              ↓
         [MCP server]
              ↓
         chạy command thật → nhận 15k token output
              ↓
         classify output type (build/test/install/generic)
              ↓
         chọn compressor tương ứng
              ↓
         cache full log ra /tmp/claude-logs/<id>.log
              ↓
         trả về 1.5k token summary + reference id
              ↑
[Claude] ← nhận summary, xử lý error
```

Claude **không bao giờ thấy 15k token gốc** — chỉ 1.5k token đã được filter.

## 3. Kiến trúc

### 3.1 Tool expose ra Claude

| Tool | Mục đích | Thay thế cho |
|------|----------|--------------|
| `smart_run` | Chạy command bất kỳ, auto-classify output | `bash` |
| `smart_build` | Build tool (gradle/npm/cargo/make) với compressor riêng | `bash gradle build` |
| `smart_test` | Test runner, giữ failed + summary | `bash pytest`, `bash npm test` |
| `smart_read_log` | Đọc file log lớn với grep/section | `view` trên file log |
| `get_full_output` | Lấy lại bản đầy đủ từ cache khi cần | — |

### 3.2 Pipeline xử lý

```
[Raw output]
     ↓
[Size check] — nếu < 500 token, trả nguyên (không nén)
     ↓
[Classifier] — regex/heuristic nhận diện type
     ↓
[Type-specific compressor]
     ├── BuildCompressor    (gradle, maven, cargo, go build)
     ├── TestCompressor     (pytest, jest, junit, go test)
     ├── InstallCompressor  (npm, pip, gem, apt)
     ├── StackTraceCompressor (Java, Kotlin, Python, JS)
     └── GenericCompressor  (dedupe + truncate)
     ↓
[Cache full log] — /tmp/claude-logs/<uuid>.log, TTL 24h
     ↓
[Format response]
     - Summary (errors, warnings, status)
     - Compression stats (15234 → 1847 token, 87.9%)
     - Reference id để request chi tiết
```

### 3.3 Format response chuẩn

```
BUILD FAILED (2 errors, 14 warnings)
Duration: 23.4s

[ERRORS]
  app/build.gradle:45
    Unresolved reference: viewBinding
  MainActivity.kt:128
    Type mismatch: expected String, found Int?

[WARNINGS] 14 unique (collapsed from 47 occurrences)
  - Deprecated API usage: View.setBackgroundDrawable (3x)
  - Unused parameter: savedInstanceState (2x)
  ...

[STATS] Compressed 15,234 → 1,847 tokens (87.9% reduction)
[FULL LOG] id=abc123 — call get_full_output(id="abc123", grep="...") for details
```

## 4. Compressor logic per type

### 4.1 BuildCompressor (gradle/maven/cargo)

Giữ lại:
- Final status (SUCCESS/FAILED)
- Tất cả errors với file:line + message
- Unique warnings (dedupe, đếm occurrence)
- Build duration

Bỏ đi:
- Progress percentage
- Task names không có error
- Dependency resolution log
- Download progress

### 4.2 TestCompressor (pytest/jest/junit)

Giữ lại:
- Summary line (X passed, Y failed, Z skipped)
- Toàn bộ failed tests với assertion diff
- Skip reason nếu có

Bỏ đi:
- Passed test verbose log
- Setup/teardown output khi test pass
- Coverage report (trừ khi được yêu cầu)

### 4.3 InstallCompressor (npm/pip)

Giữ lại:
- Final status
- Errors / conflicts
- New packages added
- Vulnerability summary (số lượng theo severity)

Bỏ đi:
- Download progress
- Individual package warnings lặp
- Peer dependency notes không actionable

### 4.4 StackTraceCompressor

Giữ lại:
- Exception type + message
- Top 3 frames
- Tất cả frames thuộc code app (nhận biết qua package prefix trong config)
- Caused-by chain

Bỏ đi:
- Framework internals (android.os.*, java.lang.reflect.*, kotlinx.coroutines.internal.*)
- Reflection frames
- Proxy/synthetic frames

## 5. Config per project

File `.claude-log-compress.toml` tại root project:

```toml
[project]
app_packages = ["com.example.myapp", "com.example.myapp.data"]
build_tool = "gradle"

[compress]
min_size_tokens = 500          # duoi nguong nay khong nen
max_output_tokens = 3000       # cap cho output sau khi nen
keep_warnings = true
dedupe_warnings = true

[cache]
dir = "/tmp/claude-logs"
ttl_hours = 24

[rules.build]
keep_deprecation = false       # deprecation warning thuong khong urgent

[rules.test]
keep_passed_names = false      # chi liet ke failed
show_slowest = 5               # list top 5 slowest test
```

## 6. Tech stack đề xuất

**Ngôn ngữ:** TypeScript / Node.js

Lý do:
- MCP SDK chính thức của Anthropic mature nhất ở TypeScript
- Ecosystem parser phong phú (tree-sitter, ansi-regex, strip-ansi)
- Dễ distribute qua npm, user cài 1 lệnh `npx smart-log-compress-mcp`
- Performance đủ cho use case này

**Dependencies chính:**
- `@modelcontextprotocol/sdk` — MCP server framework
- `execa` — chạy child process robust
- `strip-ansi` — xoá color code
- `tiktoken` — đếm token chuẩn theo tokenizer của Claude
- `zod` — validate config

**Build/distribution:**
- Build single bundle bằng `esbuild`
- Publish npm package
- User cài qua MCP config của Claude Code:

```json
{
  "mcpServers": {
    "smart-log-compress": {
      "command": "npx",
      "args": ["-y", "smart-log-compress-mcp@latest"]
    }
  }
}
```

## 7. MVP scope (2 tuần)

### Tuần 1: Core + 2 compressor quan trọng nhất

- [ ] Setup MCP server skeleton với TypeScript
- [ ] Implement `smart_run` tool với classifier cơ bản
- [ ] `BuildCompressor` cho gradle (ưu tiên vì bạn có project Android test thật)
- [ ] `TestCompressor` cho jest/vitest
- [ ] Cache system + `get_full_output` tool
- [ ] Config loader (.toml)

### Tuần 2: Mở rộng + polish

- [ ] `InstallCompressor` cho npm/pip
- [ ] `StackTraceCompressor` (Java/Kotlin/JS)
- [ ] Token counting accurate (tiktoken)
- [ ] Benchmark suite với fixture log thật
- [ ] README có số liệu cụ thể
- [ ] Publish npm + demo video

### Không làm trong MVP (để sau)

- Streaming output
- Python/pytest compressor (npm ecosystem trước)
- Auto-detect project type
- UI / dashboard

## 8. Benchmark & metric

Để repo có con số thuyết phục, chuẩn bị fixture set:

```
fixtures/
├── gradle-android-build-success.log    (8.2k tokens)
├── gradle-android-build-failed.log     (12.4k tokens)
├── npm-install-fresh.log               (6.1k tokens)
├── npm-install-with-warnings.log       (9.3k tokens)
├── jest-passing.log                    (3.1k tokens)
├── jest-failing.log                    (5.4k tokens)
├── kotlin-stacktrace-npe.log           (2.1k tokens)
└── cargo-build-with-warnings.log       (7.8k tokens)
```

README hiển thị bảng:

| Scenario | Original | Compressed | Reduction |
|----------|----------|------------|-----------|
| Gradle build (Android, fail) | 12,400 | 1,650 | 86.7% |
| Gradle build (success) | 8,200 | 420 | 94.9% |
| npm install | 6,100 | 380 | 93.8% |
| Jest (5 failed / 200 passed) | 5,400 | 1,100 | 79.6% |
| Kotlin stacktrace | 2,100 | 650 | 69.0% |

Target trung bình: **> 80% reduction** trên các use case thường gặp.

## 9. Rủi ro & đối phó

| Rủi ro | Đối phó |
|--------|---------|
| Nén mất thông tin Claude cần | Luôn cache full log, expose `get_full_output`. Claude biết đường request lại |
| False positive classifier | Fallback về `GenericCompressor` khi không chắc |
| User không trust vì sợ cắt sai | Add verbose mode hiển thị compression diff, có `--passthrough` flag |
| MCP overhead lớn hơn benefit với command nhẹ | Skip compress nếu output < 500 token |
| Breaking change của Claude Code | MCP là interface ổn định của Anthropic, ít vỡ |

## 10. Go-to-market cho repo

1. **README có demo video** — show side-by-side context usage trước/sau khi dùng
2. **Blog post** về kiến trúc + số liệu benchmark
3. **Post ở đâu:**
   - r/ClaudeAI, r/LocalLLaMA
   - Hacker News (Show HN)
   - Anthropic Discord
   - Dev.to / Medium
4. **Hook đánh vào pain point cụ thể:** "Android devs: stop burning tokens on Gradle logs"
5. **Tag đúng topic GitHub:** `mcp`, `claude-code`, `anthropic`, `claude`, `token-optimization`

## 11. Roadmap sau MVP

- **v0.2** — Python/pytest, Go, Rust compressor
- **v0.3** — iOS (xcodebuild), Flutter build output
- **v0.4** — Streaming mode cho build lâu
- **v0.5** — Learning mode: tự học pattern log của project qua vài lần chạy
- **v1.0** — Plugin system để user viết compressor riêng

## 12. Naming ideas

Đặt tên repo cho catchy:

- `claude-log-slim`
- `context-saver-mcp`
- `log-trim-mcp`
- `smart-log-compress`
- `mcp-output-filter`
- `ccslim` (short, memorable)

Mình thích `ccslim` vì ngắn, dễ gõ, rõ mục tiêu (Claude Code slim).

---

## Bước tiếp theo

1. Setup repo skeleton + MCP SDK
2. Thu thập fixture log thật từ project Android của bạn làm benchmark
3. Implement `BuildCompressor` cho gradle trước — đây là killer feature cho Android dev
4. Đo số liệu thật → đưa vào README → public
