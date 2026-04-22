import { appendFileSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runInstall } from "./install/install-command.js";
import { pruneExpired, serverLogPath } from "./log-side/log-cache.js";
import { createServer } from "./server.js";

function log(msg: string): void {
  // Diagnostic logs MUST NOT go to stdout (stdio transport uses it).
  try {
    appendFileSync(serverLogPath(), `${new Date().toISOString()} ${msg}\n`);
  } catch {
    // ignore — last resort, stderr
    process.stderr.write(`${msg}\n`);
  }
}

async function main(): Promise<void> {
  if (process.argv[2] === "install") {
    process.exit(runInstall());
  }

  try {
    const pruned = pruneExpired();
    if (pruned > 0) log(`pruned ${pruned} expired log(s)`);
  } catch (err) {
    log(`prune failed: ${err}`);
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("server connected over stdio");
}

main().catch((err) => {
  log(`fatal: ${err instanceof Error ? err.stack : String(err)}`);
  process.stderr.write(`[claude-log-compressor] fatal: ${err}\n`);
  process.exit(1);
});
