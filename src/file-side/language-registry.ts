import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type LanguageId = "kotlin" | "java" | "typescript" | "javascript" | "python" | "go" | "rust";

const EXT_TO_LANG: Record<string, LanguageId> = {
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".java": "java",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".pyi": "python",
  ".go": "go",
  ".rs": "rust",
};

export function languageFromExt(ext: string): LanguageId | null {
  return EXT_TO_LANG[ext.toLowerCase()] ?? null;
}

export function languageFromPath(path: string): LanguageId | null {
  const dot = path.lastIndexOf(".");
  if (dot < 0) return null;
  return languageFromExt(path.slice(dot));
}

// Resolve the .wasm file path for a given language. At runtime the grammars
// live next to dist/file-side/ (copied there by the build's postbuild step).
// Computed relative to this module so it works regardless of how the package
// is installed.
export function grammarWasmPath(lang: LanguageId): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "grammars", "wasm", `tree-sitter-${lang}.wasm`);
}

export const LANGUAGE_PREFIX: Record<LanguageId, string> = {
  kotlin: "kt",
  java: "java",
  typescript: "ts",
  javascript: "js",
  python: "py",
  go: "go",
  rust: "rs",
};
