import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { smartRun } from "./smart-run.js";

export interface SmartBuildInput {
  tool?: "gradle" | "npm" | "cargo" | "make" | "auto";
  args?: string;
  cwd?: string;
}

export type BuildTool = "gradle" | "npm" | "cargo" | "make";

export function detectBuildTool(cwd: string): BuildTool | null {
  if (existsSync(join(cwd, "gradlew")) || hasMatch(cwd, /^build\.gradle(\.kts)?$/)) return "gradle";
  if (existsSync(join(cwd, "package.json"))) return "npm";
  if (existsSync(join(cwd, "Cargo.toml"))) return "cargo";
  if (existsSync(join(cwd, "Makefile")) || existsSync(join(cwd, "makefile"))) return "make";
  return null;
}

function hasMatch(dir: string, re: RegExp): boolean {
  try {
    return readdirSync(dir).some((f) => re.test(f));
  } catch {
    return false;
  }
}

export async function smartBuild(input: SmartBuildInput): Promise<string> {
  const cwd = input.cwd ?? process.cwd();
  let tool: BuildTool;

  if (input.tool && input.tool !== "auto") {
    tool = input.tool;
  } else {
    const detected = detectBuildTool(cwd);
    if (!detected) {
      return `[error] smart_build: could not auto-detect build tool in ${cwd}. Looked for gradlew/build.gradle*, package.json, Cargo.toml, Makefile. Pass tool="..." explicitly.`;
    }
    tool = detected;
  }

  const cmd = resolveCommand(tool, input.args ?? "", cwd);
  return smartRun({ command: cmd, cwd });
}

function resolveCommand(tool: BuildTool, args: string, cwd: string): string {
  switch (tool) {
    case "gradle": {
      const wrapper = existsSync(join(cwd, "gradlew")) ? "./gradlew" : "gradle";
      return `${wrapper} ${args || "build"}`.trim();
    }
    case "npm":
      return `npm ${args || "run build"}`.trim();
    case "cargo":
      return `cargo ${args || "build"}`.trim();
    case "make":
      return `make ${args}`.trim();
  }
}
