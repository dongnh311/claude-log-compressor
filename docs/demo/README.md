# Real-world demo artifacts

Captured live on a real Android project (MasterCamera — Compose UI + C++/NDK module, 2 Gradle modules) on 2026-04-22.

Each `*-raw.log` is exactly what `bash ./gradlew …` would have given Claude. Each `*-compressed.txt` is what `smart_build` returns instead — the full raw log stays cached on disk for `read_log_section` retrieval.

| Scenario | Raw | Compressed | Reduction |
|---|---|---|---|
| Clean debug build | `android-assembleDebug-raw.log` (8.4 KB, 2,090 tokens) | `android-assembleDebug-compressed.txt` (367 B, 82 tokens) | **96.1%** |
| Clean release build (R8 + minify) | `android-assembleRelease-raw.log` (10.9 KB, 2,720 tokens) | `android-assembleRelease-compressed.txt` (367 B, 82 tokens) | **97.0%** |
| Kotlin compile error (intentional) | `android-compileError-raw.log` (2.6 KB, 667 tokens) | `android-compileError-compressed.txt` (496 B, 114 tokens) | **82.9%** — both errors preserved with `file:line:col` |

Re-run locally on any Android project:

```bash
npx tsx scripts/real-world-test.ts /path/to/android-project "./gradlew clean :app:assembleDebug"
```

The script runs the command, compresses the output, prints the before/after token counts, and writes both full and compressed to `/tmp/rwt-*`.
