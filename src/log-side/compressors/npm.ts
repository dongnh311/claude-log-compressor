import type { ClassifierInput, CompressContext, CompressedResult, Compressor } from "../../types.js";
import { makeResult } from "../../utils.js";

const DEPRECATION_RE = /^npm\s+warn\s+deprecated\s+(\S+):\s*(.*)$/i;
const WARN_RE = /^npm\s+warn\s+(.*)$/i;
const ERR_RE = /^npm\s+(?:ERR!|error)\s*(.*)$/i;
const ADDED_RE = /^(added|removed|changed|updated)\s+\d+\s+packages?/i;
const AUDIT_RE = /^(\d+)\s+vulnerabilit(?:y|ies)/i;
const AUDIT_DETAIL_RE = /^\d+\s+(low|moderate|high|critical)/i;

export const npmCompressor: Compressor = {
  name: "npm",

  canHandle(input: ClassifierInput): boolean {
    if (/\b(npm|yarn|pnpm)\b/i.test(input.command)) return true;
    return /npm (ERR!|error|warn)/i.test(input.firstKb);
  },

  compress(fullLog: string, context: CompressContext): CompressedResult {
    const lines = fullLog.split("\n");

    const errorLines: string[] = [];
    const deprecations = new Map<string, { count: number; sample: string }>();
    const otherWarnings = new Map<string, number>();
    const changeLines: string[] = [];
    const auditLines: string[] = [];
    let inErrBlock = false;
    let errCode: string | undefined;

    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line) {
        inErrBlock = false;
        continue;
      }

      const err = ERR_RE.exec(line);
      if (err) {
        inErrBlock = true;
        const payload = (err[1] ?? "").trim();
        if (/^code\s+(\S+)/i.test(payload)) {
          errCode = payload.replace(/^code\s+/i, "");
        }
        if (payload) errorLines.push(payload);
        continue;
      }
      if (inErrBlock && /^\s+/.test(raw)) {
        errorLines.push(line.trim());
        continue;
      }

      const dep = DEPRECATION_RE.exec(line);
      if (dep) {
        const pkg = (dep[1] ?? "").replace(/@[^@]+$/, "");
        const msg = (dep[2] ?? "").trim();
        const existing = deprecations.get(pkg);
        if (existing) existing.count++;
        else deprecations.set(pkg, { count: 1, sample: msg });
        continue;
      }

      const warn = WARN_RE.exec(line);
      if (warn) {
        const msg = (warn[1] ?? "").trim();
        otherWarnings.set(msg, (otherWarnings.get(msg) ?? 0) + 1);
        continue;
      }

      if (ADDED_RE.test(line)) {
        changeLines.push(line);
        continue;
      }

      if (AUDIT_RE.test(line) || AUDIT_DETAIL_RE.test(line)) {
        auditLines.push(line);
        continue;
      }
    }

    const body = buildBody({
      errorLines,
      errCode,
      deprecations,
      otherWarnings,
      changeLines,
      auditLines,
    });
    const summary = buildSummary(errorLines.length, deprecations.size, errCode);

    return makeResult(summary, body, fullLog, context);
  },
};

function buildSummary(errorCount: number, deprecationUnique: number, errCode?: string): string {
  if (errorCount > 0) {
    const code = errCode ? ` (${errCode})` : "";
    return `npm FAILED${code}`;
  }
  if (deprecationUnique > 0) {
    return `npm OK (${deprecationUnique} unique deprecation warnings)`;
  }
  return "npm OK";
}

interface BuildBodyArgs {
  errorLines: string[];
  errCode?: string;
  deprecations: Map<string, { count: number; sample: string }>;
  otherWarnings: Map<string, number>;
  changeLines: string[];
  auditLines: string[];
}

function buildBody(a: BuildBodyArgs): string {
  const out: string[] = [];

  for (const cl of a.changeLines) out.push(cl);

  if (a.errorLines.length > 0) {
    if (out.length > 0) out.push("");
    out.push("Errors:");
    for (const l of a.errorLines.slice(0, 40)) out.push(`  ${l}`);
    if (a.errorLines.length > 40) {
      out.push(`  … ${a.errorLines.length - 40} more error lines (see read_log_section)`);
    }
  }

  if (a.deprecations.size > 0) {
    if (out.length > 0) out.push("");
    const entries = Array.from(a.deprecations.entries()).sort((x, y) => y[1].count - x[1].count);
    out.push(`Deprecated packages (${entries.length} unique):`);
    for (const [pkg, { count, sample }] of entries.slice(0, 10)) {
      const prefix = count > 1 ? `[×${count}] ` : "";
      const msg = sample.length > 80 ? `${sample.slice(0, 77)}...` : sample;
      out.push(`  ${prefix}${pkg} — ${msg}`);
    }
    if (entries.length > 10) {
      out.push(`  … ${entries.length - 10} more deprecations omitted`);
    }
  }

  const notableWarnings = Array.from(a.otherWarnings.entries())
    .filter(([msg]) => !/^deprecated\b/i.test(msg))
    .sort((x, y) => y[1] - x[1]);
  if (notableWarnings.length > 0) {
    if (out.length > 0) out.push("");
    out.push(`Other warnings (${notableWarnings.length} unique):`);
    for (const [msg, count] of notableWarnings.slice(0, 8)) {
      const prefix = count > 1 ? `[×${count}] ` : "";
      out.push(`  ${prefix}${msg}`);
    }
  }

  if (a.auditLines.length > 0) {
    if (out.length > 0) out.push("");
    out.push("Audit:");
    for (const l of a.auditLines) out.push(`  ${l}`);
  }

  return out.join("\n");
}
