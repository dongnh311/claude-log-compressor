import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENTRY_NAME = "context-saver";
const LEGACY_ENTRY_NAMES = ["log-compressor", "claude-log-compressor"];
const DESIRED_ENTRY = {
  type: "stdio",
  command: "npx",
  args: ["-y", "@dongnh311/claude-context-saver@latest"],
} as const;

interface ClaudeConfig {
  mcpServers?: Record<string, unknown>;
  [k: string]: unknown;
}

export function runInstall(): number {
  const target = resolveConfigPath();
  const config = loadOrInit(target);

  config.mcpServers = config.mcpServers ?? {};
  const servers = config.mcpServers;

  const already = JSON.stringify(servers[ENTRY_NAME]) === JSON.stringify(DESIRED_ENTRY);
  const legacyFound = LEGACY_ENTRY_NAMES.filter(
    (n) => n in servers && isLegacyEntry(servers[n]),
  );

  if (already && legacyFound.length === 0) {
    process.stderr.write(`✓ Already installed at ${target}\n`);
    return 0;
  }

  backup(target);

  for (const legacy of legacyFound) {
    delete servers[legacy];
    process.stderr.write(`  Removed legacy entry: ${legacy}\n`);
  }
  servers[ENTRY_NAME] = DESIRED_ENTRY;

  writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  process.stderr.write(`✓ Installed @dongnh311/claude-context-saver\n`);
  process.stderr.write(`  Config:  ${target}\n`);
  process.stderr.write(`  Backup:  ${target}.bak\n`);
  process.stderr.write("\n");
  process.stderr.write("Next: restart Claude Code (or run /mcp to hot-reload).\n");
  process.stderr.write(
    `To remove later: claude mcp remove ${ENTRY_NAME} -s user\n`,
  );
  return 0;
}

function resolveConfigPath(): string {
  const primary = join(homedir(), ".claude.json");
  const alt = join(homedir(), ".claude", "mcp.json");
  if (existsSync(primary)) return primary;
  if (existsSync(alt)) return alt;
  return primary;
}

function loadOrInit(path: string): ClaudeConfig {
  if (!existsSync(path)) {
    writeFileSync(path, '{\n  "mcpServers": {}\n}\n', "utf8");
    process.stderr.write(`Created ${path}\n`);
    return { mcpServers: {} };
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ClaudeConfig;
  } catch (err) {
    throw new Error(`Cannot parse ${path} as JSON: ${err}`);
  }
}

function backup(path: string): void {
  try {
    copyFileSync(path, `${path}.bak`);
  } catch {
    // not fatal
  }
}

function isLegacyEntry(entry: unknown): boolean {
  if (typeof entry !== "object" || entry === null) return false;
  const args = (entry as { args?: unknown }).args;
  if (!Array.isArray(args)) return false;
  return args.some(
    (a) => typeof a === "string" && /\bclaude-log-compressor\b/.test(a),
  );
}
