export interface ClassifierInput {
  command: string;
  cwd: string;
  exitCode: number;
  firstKb: string;
}

export interface CompressContext {
  maxTokens: number;
  logId: string;
}

export interface TruncatedSection {
  description: string;
  startLine: number;
  endLine: number;
}

export interface CompressedResult {
  summary: string;
  body: string;
  originalTokens: number;
  compressedTokens: number;
  logId: string;
  truncatedSections: TruncatedSection[];
}

export interface Compressor {
  name: string;
  canHandle(input: ClassifierInput): boolean;
  compress(fullLog: string, context: CompressContext): CompressedResult;
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  timedOut: boolean;
}

export interface ExecOptions {
  command: string;
  cwd?: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
}

// --- file-side -------------------------------------------------------------

export type SymbolKind =
  | "class"
  | "interface"
  | "enum"
  | "object"
  | "struct"
  | "trait"
  | "function"
  | "method"
  | "constructor"
  | "property"
  | "field"
  | "const"
  | "type_alias"
  | "namespace"
  | "module";

export interface Symbol {
  name: string;
  qualified_name: string;
  kind: SymbolKind;
  signature: string;
  modifiers: string[];
  doc: string | null;
  line_range: [number, number];
  byte_range: [number, number];
  children: Symbol[];
  parent_qualified_name: string | null;
}

export interface ParsedFile {
  file_id: string;
  path: string;
  language: string | null;
  line_count: number;
  token_estimate: number;
  symbols: Symbol[];
  parse_status: "ok" | "partial" | "failed";
  parse_errors: string[];
}
