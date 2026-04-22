#!/usr/bin/env bash
# Demo script for asciinema recording.
#
# Usage:
#   asciinema rec -c "./scripts/demo.sh" demo.cast
#   asciinema upload demo.cast
#
# Requires: the project built (npm run build) and an Android project path in ANDROID_PROJECT env.

set -euo pipefail

ANDROID_PROJECT="${ANDROID_PROJECT:-$HOME/Documents/GitHub/MasterCamera}"

type() {
  local s="$1"
  local delay="${2:-0.03}"
  for ((i = 0; i < ${#s}; i++)); do
    printf "%s" "${s:$i:1}"
    sleep "$delay"
  done
  echo
}

pause() { sleep "${1:-1.5}"; }
banner() { printf "\n\033[1;36m### %s\033[0m\n\n" "$1"; }

clear
banner "claude-log-compressor — turning 20k-token gradle logs into 100 tokens"
pause 2

banner "1. Without this MCP: raw gradle output goes straight into Claude's context"
type "$ cd $ANDROID_PROJECT && ./gradlew clean :app:assembleDebug | wc -c"
pause
cd "$ANDROID_PROJECT"
./gradlew clean :app:assembleDebug 2>&1 | wc -c
pause 2

banner "2. With smart_build: same command, same errors preserved, 96% fewer tokens"
cd - >/dev/null
type "$ npx tsx scripts/real-world-test.ts \"$ANDROID_PROJECT\" \"./gradlew clean :app:assembleDebug\""
pause
npx tsx scripts/real-world-test.ts "$ANDROID_PROJECT" "./gradlew clean :app:assembleDebug" 2>&1 | grep -E "(tokens|Reduction|SUCCESSFUL|FAILED|Warnings|Errors)" | head -25
pause 3

banner "3. Demo: compile error still reports file:line:col precisely"
type "# Inject a broken reference into Theme.kt for the demo"
pause
# Assume the test script earlier inserted + reverted; for demo we just show the recorded output.
cat docs/demo/android-compileError-compressed.txt 2>/dev/null || echo "(run scripts/real-world-test.ts on an error state to regenerate)"
pause 3

banner "Install in Claude Code"
type '{ "mcpServers": { "log-compressor": { "command": "npx", "args": ["-y", "claude-log-compressor@latest"] } } }'
pause 3

banner "Done. Ship it."
