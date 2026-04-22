import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { smartRun } from "./smart-run.js";

export interface SmartTestInput {
  framework?: "junit" | "jest" | "pytest" | "go" | "auto";
  pattern?: string;
  cwd?: string;
}

export type TestFramework = "junit" | "jest" | "pytest" | "go";

export function detectTestFramework(cwd: string): TestFramework | null {
  if (existsSync(join(cwd, "go.mod"))) return "go";
  if (hasPyTest(cwd)) return "pytest";

  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
      dependencies?: Record<string, unknown>;
      devDependencies?: Record<string, unknown>;
      scripts?: Record<string, unknown>;
    };
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    if ("jest" in all || "vitest" in all) return "jest";
    const scripts = Object.values(pkg.scripts ?? {}) as string[];
    if (scripts.some((s) => /\b(jest|vitest)\b/.test(s))) return "jest";
  } catch {
    // no package.json or malformed
  }

  if (existsSync(join(cwd, "gradlew")) || hasGradleBuild(cwd)) return "junit";

  return null;
}

function hasPyTest(cwd: string): boolean {
  if (existsSync(join(cwd, "pytest.ini"))) return true;
  if (existsSync(join(cwd, "conftest.py"))) return true;
  try {
    if (/\[tool\.pytest/.test(readFileSync(join(cwd, "pyproject.toml"), "utf8"))) return true;
  } catch {
    // no pyproject.toml or malformed
  }
  return false;
}

function hasGradleBuild(cwd: string): boolean {
  try {
    return ["build.gradle", "build.gradle.kts"].some((f) => existsSync(join(cwd, f)));
  } catch {
    return false;
  }
}

export async function smartTest(input: SmartTestInput): Promise<string> {
  const cwd = input.cwd ?? process.cwd();
  let fw: TestFramework;

  if (input.framework && input.framework !== "auto") {
    fw = input.framework;
  } else {
    const detected = detectTestFramework(cwd);
    if (!detected) {
      return `[error] smart_test: could not auto-detect test framework in ${cwd}. Looked for go.mod, pytest config, jest/vitest in package.json, gradle wrapper. Pass framework="..." explicitly.`;
    }
    fw = detected;
  }

  const cmd = resolveCommand(fw, input.pattern);
  return smartRun({ command: cmd, cwd });
}

function resolveCommand(fw: TestFramework, pattern?: string): string {
  const p = pattern ? ` ${pattern}` : "";
  switch (fw) {
    case "jest":
      return `npx --no-install jest${p}`;
    case "pytest":
      return `pytest${p}`;
    case "go":
      return `go test ./...${p}`;
    case "junit":
      return `./gradlew test${p}`;
  }
}
