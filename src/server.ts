import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { findReferencesInFile } from "./file-side/tools/find-references.js";
import { listSymbols } from "./file-side/tools/list-symbols.js";
import { readLines } from "./file-side/tools/read-lines.js";
import { readSymbol } from "./file-side/tools/read-symbol.js";
import { smartRead } from "./file-side/tools/smart-read.js";
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
    { name: "claude-context-saver", version: VERSION },
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
    case "list_symbols": {
      if (typeof args.path !== "string") throw new Error("path (string) is required");
      return listSymbols(args as unknown as Parameters<typeof listSymbols>[0]);
    }
    case "read_symbol": {
      if (typeof args.path !== "string") throw new Error("path (string) is required");
      if (!Array.isArray(args.names)) throw new Error("names (string[]) is required");
      return readSymbol(args as unknown as Parameters<typeof readSymbol>[0]);
    }
    case "smart_read": {
      if (typeof args.path !== "string") throw new Error("path (string) is required");
      return smartRead(args as unknown as Parameters<typeof smartRead>[0]);
    }
    case "find_references_in_file": {
      if (typeof args.path !== "string") throw new Error("path (string) is required");
      if (typeof args.identifier !== "string") throw new Error("identifier (string) is required");
      return findReferencesInFile(args as unknown as Parameters<typeof findReferencesInFile>[0]);
    }
    case "read_lines": {
      if (typeof args.path !== "string") throw new Error("path (string) is required");
      if (typeof args.start_line !== "number") throw new Error("start_line (number) is required");
      if (typeof args.end_line !== "number") throw new Error("end_line (number) is required");
      return readLines(args as unknown as Parameters<typeof readLines>[0]);
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
  {
    name: "smart_read",
    description:
      "Read a source file intelligently. For files >300 lines, PREFER this over the standard Read tool — returns a symbol outline first, focused bodies on demand. Typical savings: 70–90% tokens vs. whole-file reads. Supports Kotlin, Java, TypeScript, JavaScript, Python, Go, Rust. Use `focus` to zoom into a specific symbol by name or regex. Use mode='full' only when you truly need every line.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Source file path" },
        focus: {
          type: "string",
          description: "Symbol name, qualified name (Class.method), or regex to zoom into",
        },
        mode: {
          type: "string",
          enum: ["outline", "full", "auto"],
          description: "'outline' = symbols without bodies; 'full' = whole file; 'auto' (default) = outline for large files, full for small",
        },
        max_tokens: {
          type: "number",
          description: "Cap on returned tokens (default 2000)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "list_symbols",
    description:
      "List the symbol tree (classes/functions/interfaces/properties) of a source file WITHOUT bodies. Use before reading a large source file so you only fetch the bits you need. Supports Kotlin, Java, TypeScript, JavaScript, Python, Go, Rust.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or relative source file path" },
        kinds: {
          type: "array",
          items: { type: "string" },
          description: "Filter to specific symbol kinds (e.g. ['class','interface'])",
        },
        depth: {
          type: "number",
          description: "0=top-level only, -1=all nested (default -1)",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "read_symbol",
    description:
      "Return the source code body of one or more named symbols. Supports dotted qualified names like 'AuthViewModel.login' for nested symbols. Use after list_symbols to fetch only the specific functions/classes you need.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Source file path" },
        names: {
          type: "array",
          items: { type: "string" },
          description: "Symbol names, optionally dotted (e.g. 'Foo.bar'). Unqualified names match any symbol with that name.",
        },
        include_surrounding: {
          type: "boolean",
          description: "If true, include enclosing class/namespace context note (default false)",
        },
      },
      required: ["path", "names"],
    },
  },
  {
    name: "find_references_in_file",
    description:
      "Find occurrences of an identifier within a single file, with AST-aware 'inside <symbol>' annotation. For cross-file search use your regular grep tool.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        identifier: { type: "string", description: "Identifier to search for (word-boundary match)" },
        context_lines: {
          type: "number",
          description: "Lines of context around each match (default 2)",
        },
      },
      required: ["path", "identifier"],
    },
  },
  {
    name: "read_lines",
    description:
      "Read a specific line range from a file. Line-range fallback when smart_read's symbol approach doesn't fit (e.g. middle of a 500-line function).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        start_line: { type: "number", description: "1-indexed start (inclusive)" },
        end_line: { type: "number", description: "1-indexed end (inclusive)" },
        max_tokens: { type: "number", description: "Cap returned tokens (default 2000)" },
      },
      required: ["path", "start_line", "end_line"],
    },
  },
];
