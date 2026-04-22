import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readLogSection } from "./log-side/tools/read-log-section.js";
import { smartBuild } from "./log-side/tools/smart-build.js";
import { smartRun } from "./log-side/tools/smart-run.js";
import { smartTest } from "./log-side/tools/smart-test.js";

const VERSION = readVersion();

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

export function createServer(): Server {
  const server = new Server(
    { name: "claude-log-compressor", version: VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_SCHEMAS }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args = {} } = req.params;
    try {
      const text = await dispatch(name, args as Record<string, unknown>);
      return { content: [{ type: "text", text }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `[error] ${name}: ${msg}` }],
        isError: true,
      };
    }
  });

  return server;
}

async function dispatch(name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "smart_run": {
      if (typeof args.command !== "string") throw new Error("command (string) is required");
      return smartRun(args as unknown as Parameters<typeof smartRun>[0]);
    }
    case "smart_build":
      return smartBuild(args as unknown as Parameters<typeof smartBuild>[0]);
    case "smart_test":
      return smartTest(args as unknown as Parameters<typeof smartTest>[0]);
    case "read_log_section": {
      if (typeof args.log_id !== "string") throw new Error("log_id (string) is required");
      return readLogSection(args as unknown as Parameters<typeof readLogSection>[0]);
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

const TOOL_SCHEMAS = [
  {
    name: "smart_run",
    description:
      "Run a shell command and return a compressed summary of its output. ALWAYS prefer this over running commands via bash when you expect noisy output (builds, installs, tests) — it returns the same information in 5–10× fewer tokens while preserving all errors. Full log is cached; call read_log_section for details.",
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to run" },
        cwd: { type: "string", description: "Working directory (default = server cwd)" },
        timeout_seconds: { type: "number", description: "Kill after N seconds (default 300)" },
        max_output_tokens: {
          type: "number",
          description: "Cap on compressed output tokens (default 2000)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "smart_build",
    description:
      "Run a build tool (gradle/npm/cargo/make) with output compression. ALWAYS prefer this over invoking the build tool via bash — it strips progress/download/task-chatter noise while keeping every error and deduped warning.",
    inputSchema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          enum: ["gradle", "npm", "cargo", "make", "auto"],
          description: "Build tool (default auto)",
        },
        args: { type: "string", description: "Extra args appended to the build command" },
        cwd: { type: "string" },
      },
    },
  },
  {
    name: "smart_test",
    description:
      "Run a test runner (jest/pytest/junit/go) and return only failures + summary. ALWAYS prefer this over running tests via bash — passed-test noise is collapsed to a count, failed tests keep full assertion detail.",
    inputSchema: {
      type: "object",
      properties: {
        framework: {
          type: "string",
          enum: ["jest", "pytest", "junit", "go", "auto"],
          description: "Test framework (default auto)",
        },
        pattern: { type: "string", description: "Filter/pattern passed to the runner" },
        cwd: { type: "string" },
      },
    },
  },
  {
    name: "read_log_section",
    description:
      "Retrieve a section of a previously cached full log by log_id. Use when smart_run/smart_build/smart_test compressed output isn't enough and you need raw detail.",
    inputSchema: {
      type: "object",
      properties: {
        log_id: { type: "string", description: "log_id from a previous compressed result" },
        grep: { type: "string", description: "Case-insensitive regex filter" },
        lines_around: { type: "number", description: "Context lines around grep matches (default 3)" },
        start_line: { type: "number", description: "1-indexed start line (inclusive)" },
        end_line: { type: "number", description: "1-indexed end line (inclusive)" },
        max_tokens: { type: "number", description: "Cap on returned tokens (default 2000)" },
      },
      required: ["log_id"],
    },
  },
];
