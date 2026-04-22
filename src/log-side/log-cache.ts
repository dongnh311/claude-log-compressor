import { randomBytes } from "node:crypto";
import { mkdirSync, promises as fsp, readdirSync, statSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_DIR = join(homedir(), ".cache", "claude-log-compressor");
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

mkdirSync(CACHE_DIR, { recursive: true });

export function cacheDir(): string {
  return CACHE_DIR;
}

export function newLogId(prefix: string): string {
  const sanitized = prefix.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "log";
  return `${sanitized}_${randomBytes(6).toString("hex")}`;
}

export async function writeLog(logId: string, content: string): Promise<string> {
  const path = join(CACHE_DIR, `${logId}.log`);
  await fsp.writeFile(path, content, "utf8");
  return path;
}

export async function readLog(logId: string): Promise<string | null> {
  const path = join(CACHE_DIR, `${logId}.log`);
  try {
    return await fsp.readFile(path, "utf8");
  } catch {
    return null;
  }
}

export function pruneExpired(now: number = Date.now()): number {
  let removed = 0;
  for (const name of readdirSync(CACHE_DIR)) {
    if (!name.endsWith(".log")) continue;
    const full = join(CACHE_DIR, name);
    try {
      const st = statSync(full);
      if (now - st.mtimeMs > TTL_MS) {
        unlinkSync(full);
        removed++;
      }
    } catch {
      // ignore
    }
  }
  return removed;
}

export function serverLogPath(): string {
  return join(CACHE_DIR, "server.log");
}
