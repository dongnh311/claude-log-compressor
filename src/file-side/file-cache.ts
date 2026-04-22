import { createHash } from "node:crypto";
import {
  mkdirSync,
  promises as fsp,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { estimateTokens } from "../tokens.js";
import type { ParsedFile } from "../types.js";
import { LANGUAGE_PREFIX, languageFromPath, type LanguageId } from "./language-registry.js";
import { parseSource } from "./parser.js";
import { extractSymbols } from "./symbol-index.js";

const SYMBOLS_DIR = join(homedir(), ".cache", "claude-context-saver", "symbols");
const MAX_LRU_ENTRIES = 50;

mkdirSync(SYMBOLS_DIR, { recursive: true });

interface MemoryEntry {
  fileId: string;
  parsed: ParsedFile;
  source: string;
}

const lru = new Map<string, MemoryEntry>(); // keyed by abs path

function touch(key: string, entry: MemoryEntry): void {
  lru.delete(key);
  lru.set(key, entry);
  while (lru.size > MAX_LRU_ENTRIES) {
    const oldest = lru.keys().next().value;
    if (!oldest) break;
    lru.delete(oldest);
  }
}

interface FileHandle {
  absPath: string;
  mtimeMs: number;
  size: number;
  language: LanguageId | null;
  fileId: string;
}

function computeHandle(path: string): FileHandle {
  const absPath = resolve(path);
  const st = statSync(absPath);
  const language = languageFromPath(absPath);
  const prefix = language ? LANGUAGE_PREFIX[language] : "txt";
  const hash = createHash("sha256")
    .update(absPath)
    .update("\0")
    .update(String(st.mtimeMs))
    .update("\0")
    .update(String(st.size))
    .digest("hex")
    .slice(0, 12);
  return {
    absPath,
    mtimeMs: st.mtimeMs,
    size: st.size,
    language,
    fileId: `${prefix}_${hash}`,
  };
}

export async function loadParsedFile(path: string): Promise<{ parsed: ParsedFile; source: string }> {
  const handle = computeHandle(path);
  const memKey = handle.absPath;
  const cached = lru.get(memKey);
  if (cached && cached.fileId === handle.fileId) {
    touch(memKey, cached);
    return { parsed: cached.parsed, source: cached.source };
  }

  const diskPath = join(SYMBOLS_DIR, `${handle.fileId}.json`);
  const source = readFileSync(handle.absPath, "utf8");
  const lineCount = source.split("\n").length;

  // Fast path: disk-cached ParsedFile (without re-parsing AST).
  try {
    const diskRaw = await fsp.readFile(diskPath, "utf8");
    const parsed = JSON.parse(diskRaw) as ParsedFile;
    const entry: MemoryEntry = { fileId: handle.fileId, parsed, source };
    touch(memKey, entry);
    return { parsed, source };
  } catch {
    // cache miss — parse
  }

  const parsed = await buildParsedFile(handle, source, lineCount);
  await fsp.writeFile(diskPath, JSON.stringify(parsed), "utf8");
  const entry: MemoryEntry = { fileId: handle.fileId, parsed, source };
  touch(memKey, entry);
  return { parsed, source };
}

async function buildParsedFile(
  handle: FileHandle,
  source: string,
  lineCount: number,
): Promise<ParsedFile> {
  const base: Omit<ParsedFile, "symbols" | "parse_status" | "parse_errors" | "language"> = {
    file_id: handle.fileId,
    path: handle.absPath,
    line_count: lineCount,
    token_estimate: estimateTokens(source),
  };

  if (!handle.language) {
    return {
      ...base,
      language: null,
      symbols: [],
      parse_status: "failed",
      parse_errors: ["unsupported language"],
    };
  }

  try {
    const tree = await parseSource(handle.language, source);
    const { symbols, parse_errors } = extractSymbols(handle.language, tree, source);
    const status = parse_errors.length > 0 ? "partial" : "ok";
    return {
      ...base,
      language: handle.language,
      symbols,
      parse_status: status,
      parse_errors,
    };
  } catch (err) {
    return {
      ...base,
      language: handle.language,
      symbols: [],
      parse_status: "failed",
      parse_errors: [String(err)],
    };
  }
}

export function pruneSymbolCache(now: number = Date.now()): number {
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;
  let removed = 0;
  try {
    for (const name of readdirSync(SYMBOLS_DIR)) {
      if (!name.endsWith(".json")) continue;
      const full = join(SYMBOLS_DIR, name);
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
  } catch {
    // dir missing: nothing to do
  }
  return removed;
}

export function symbolsDir(): string {
  return SYMBOLS_DIR;
}

// Read file content (cached in-memory via the LRU).
export function getCachedSource(absPath: string): string | null {
  const entry = lru.get(resolve(absPath));
  return entry?.source ?? null;
}
