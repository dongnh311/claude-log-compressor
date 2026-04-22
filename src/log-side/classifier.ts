import type { ClassifierInput } from "../types.js";

export type OutputKind = "gradle" | "npm" | "jest" | "pytest" | "junit" | "generic";

export function classify(input: ClassifierInput): OutputKind {
  const cmd = input.command.toLowerCase();
  const head = input.firstKb;

  const hasJunitSignature = /\b\S+(?:\.\S+)+\s+>\s+\S+\s+(PASSED|FAILED|SKIPPED)\b/.test(head);
  if (hasJunitSignature) return "junit";

  if (/\b(gradle|gradlew)\b/.test(cmd)) {
    if (/test/.test(cmd)) return "junit";
    return "gradle";
  }

  if (/\bpytest\b/.test(cmd) || /=+\s*test session starts\s*=+/.test(head)) return "pytest";
  if (/\b(jest|vitest)\b/.test(cmd)) return "jest";
  if (/^(PASS|FAIL)\s+/m.test(head) && /Test Suites:|Tests:/.test(head)) return "jest";

  if (/\b(npm|yarn|pnpm)\b/.test(cmd) || /npm (ERR!|error|warn)/i.test(head)) return "npm";

  if (/BUILD (SUCCESSFUL|FAILED)/.test(head)) return "gradle";

  return "generic";
}
