import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// -----------------------------------------------------------------------------
// 1. Create MCP Server
// -----------------------------------------------------------------------------
const server = new McpServer({
  name: "mcp-demo",
  version: "1.0.0",
});

// -----------------------------------------------------------------------------
// 2. TOOLS
// -----------------------------------------------------------------------------

// ➤ 2.1 Add Numbers Tool
server.registerTool(
  "add_numbers",
  {
    title: "Addition Tool",
    description: "Adds two numbers and returns the result",
    inputSchema: {
      a: z.number(),
      b: z.number(),
    },
    outputSchema: {
      result: z.number(),
    },
  },
  async ({ a, b }) => {
    const result = a + b;
    return {
      content: [{ type: "text", text: JSON.stringify({ result }) }],
      structuredContent: { result },
    };
  }
);

// ➤ 2.2 Current IST Time
server.registerTool(
  "current_time_ist",
  {
    title: "Current Time (IST)",
    description: "Returns date/time in Asia/Kolkata.",
    inputSchema: {},
    outputSchema: {
      iso: z.string(),
      human: z.string(),
    },
  },
  async () => {
    const now = new Date();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            iso: now.toISOString(),
            human: now.toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
              dateStyle: "full",
              timeStyle: "long",
            }),
          }),
        },
      ],
      structuredContent: {
        iso: now.toISOString(),
        human: now.toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          dateStyle: "full",
          timeStyle: "long",
        }),
      },
    };
  }
);

// ➤ 2.3 Read File Tool
server.registerTool(
  "read_project_file",
  {
    title: "Read Project File",
    description: "Reads a text file inside the project directory.",
    inputSchema: {
      relativePath: z.string(),
    },
    outputSchema: {
      relativePath: z.string(),
      absolutePath: z.string(),
      content: z.string(),
    },
  },
  async ({ relativePath }) => {
    const base = process.cwd();
    const absolutePath = path.resolve(base, relativePath);

    try {
      const content = await fs.readFile(absolutePath, "utf8");
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              relativePath,
              absolutePath,
              content,
            }),
          },
        ],
        structuredContent: { relativePath, absolutePath, content },
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              relativePath,
              absolutePath,
              error: err.message,
            }),
          },
        ],
        structuredContent: { relativePath, absolutePath, error: err.message },
      };
    }
  }
);

// ➤ 2.4 List Directory Tool
server.registerTool(
  "list_project_directory",
  {
    title: "List Directory",
    description: "Lists files and directories in the project folder.",
    inputSchema: {
      relativePath: z.string().optional(),
    },
    outputSchema: {
      directory: z.string(),
      entries: z.array(
        z.object({
          name: z.string(),
          type: z.enum(["file", "directory", "other"]),
        })
      ),
    },
  },
  async ({ relativePath }) => {
    const dirPath = path.resolve(process.cwd(), relativePath || ".");

    try {
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      const entries = files.map((file) => ({
        name: file.name,
        type: file.isDirectory()
          ? "directory"
          : file.isFile()
          ? "file"
          : "other",
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ directory: dirPath, entries }),
          },
        ],
        structuredContent: { directory: dirPath, entries },
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ directory: dirPath, error: err.message }),
          },
        ],
        structuredContent: { directory: dirPath, error: err.message },
      };
    }
  }
);

// -----------------------------------------------------------------------------
// 3. Resource Example
// -----------------------------------------------------------------------------
server.registerResource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  {
    title: "Greeting Resource",
    description: "Returns a greeting message",
  },
  async (uri, { name }) => ({
    contents: [{ uri: uri.href, text: `Hello, ${name}!` }],
  })
);

// -----------------------------------------------------------------------------
// 4. EXPRESS + MCP (POST /mcp ONLY)
// -----------------------------------------------------------------------------
const app = express();
app.use(express.json());

app.post("/mcp", async (req: Request, res: Response) => {
  console.log("MCP request received");

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    enableJsonResponse: true, // JSON mode for ChatGPT
  });

  res.on("close", () => transport.close());

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// -----------------------------------------------------------------------------
// 5. Start Server
// -----------------------------------------------------------------------------
const port = Number(process.env.PORT) || 3000;

app.listen(port, () =>
  console.log(`🚀 MCP server running at http://0.0.0.0:${port}/mcp`)
);
