// Line-based chunking for unsupported languages or files that can't be
// tree-sitter parsed. Used by smart_read when the normal path can't produce
// a symbol index.

export interface FallbackResult {
  text: string;
  mode: "full" | "head-tail";
}

const SMALL_FILE_LINES = 300;
const HEAD_LINES = 50;
const TAIL_LINES = 50;

export function fallbackChunk(path: string, source: string): FallbackResult {
  const lines = source.split("\n");
  if (lines.length <= SMALL_FILE_LINES) {
    return {
      text: [
        `File: ${path}`,
        `Language: plain · ${lines.length} lines`,
        "",
        "```",
        source,
        "```",
      ].join("\n"),
      mode: "full",
    };
  }
  const head = lines.slice(0, HEAD_LINES);
  const tail = lines.slice(lines.length - TAIL_LINES);
  const omitted = lines.length - head.length - tail.length;
  return {
    text: [
      `File: ${path}`,
      `Language: plain · ${lines.length} lines (too large for full return; showing head + tail)`,
      "",
      "HEAD (first 50 lines)",
      "---------------------------------------------------------",
      ...head.map((l, i) => `${i + 1}: ${l}`),
      "",
      `... [${omitted} lines omitted — use read_lines for specific ranges] ...`,
      "",
      "TAIL (last 50 lines)",
      "---------------------------------------------------------",
      ...tail.map((l, i) => `${lines.length - TAIL_LINES + i + 1}: ${l}`),
    ].join("\n"),
    mode: "head-tail",
  };
}
