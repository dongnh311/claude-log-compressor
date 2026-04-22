#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  {
    name: "smart-log-compress-mcp",
    version: "0.0.1",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "smart_run",
        description:
          "Run an arbitrary shell command and return a compressed summary of its output. Full output is cached; use get_full_output to retrieve it.",
        inputSchema: {
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command to run" },
            cwd: { type: "string", description: "Working directory" },
          },
          required: ["command"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  return {
    content: [
      {
        type: "text",
        text: `[stub] tool '${name}' not yet implemented`,
      },
    ],
    isError: true,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("[smart-log-compress-mcp] fatal:", err);
  process.exit(1);
});
