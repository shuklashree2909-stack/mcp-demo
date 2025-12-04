import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

// ------------------------------------------------------------
// 1. Create the MCP server
// ------------------------------------------------------------
const server = new McpServer({
  name: "mcp-demo",
  version: "1.0.0",
});

// ------------------------------------------------------------
// 2. MCP TOOLS
// ------------------------------------------------------------

// 2.1 Add numbers
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

// 2.2 Current time (IST)
server.registerTool(
  "current_time_ist",
  {
    title: "Time Tool (IST)",
    description: "Returns the current time in Asia/Kolkata timezone.",
    inputSchema: {},
    outputSchema: {
      iso: z.string(),
      human: z.string(),
    },
  },
  async () => {
    const now = new Date();
    const iso = now.toISOString();
    const human = now.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "full",
      timeStyle: "long",
    });

    return {
      content: [{ type: "text", text: JSON.stringify({ iso, human }) }],
      structuredContent: { iso, human },
    };
  }
);

// 2.3 Read file
server.registerTool(
  "read_project_file",
  {
    title: "Read Project File",
    description: "Reads a text file from the server project.",
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
    const abs = path.resolve(base, relativePath);

    try {
      const content = await fs.readFile(abs, "utf8");
      return {
        content: [{ type: "text", text: JSON.stringify({ relativePath, absolutePath: abs, content }) }],
        structuredContent: { relativePath, absolutePath: abs, content },
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: JSON.stringify({ relativePath, absolutePath: abs, error: err.message }) }],
        structuredContent: { relativePath, absolutePath: abs, error: err.message },
      };
    }
  }
);

// 2.4 List directory
server.registerTool(
  "list_project_directory",
  {
    title: "List Directory",
    description: "Lists files/folders inside a project directory.",
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
      const items = await fs.readdir(dirPath, { withFileTypes: true });

      const entries = items.map((i) => ({
        name: i.name,
        type: i.isDirectory() ? "directory" : i.isFile() ? "file" : "other",
      }));

      return {
        content: [{ type: "text", text: JSON.stringify({ directory: dirPath, entries }) }],
        structuredContent: { directory: dirPath, entries },
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: JSON.stringify({ directory: dirPath, error: err.message }) }],
        structuredContent: { directory: dirPath, error: err.message },
      };
    }
  }
);

// ------------------------------------------------------------
// 3. RESOURCE EXAMPLE
// ------------------------------------------------------------
server.registerResource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  {
    title: "Greeting Resource",
    description: "Returns a greeting text.",
  },
  async (uri, { name }) => {
    return {
      contents: [
        {
          uri: uri.href,
          text: `Hello, ${name}!`,
        },
      ],
    };
  }
);

// ------------------------------------------------------------
// 4. EXPRESS + MCP HTTP TRANSPORT
// ------------------------------------------------------------
const app = express();
app.use(express.json());

// ----------- POST /mcp -----------
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    console.log("POST /mcp hit");

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),   // ✅ required
      enableJsonResponse: true                         // optional
    });

    res.on("close", () => transport.close());

    await server.connect(transport);

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("MCP POST error:", err);
    if (!res.headersSent)
      res.status(500).json({ error: "Internal MCP server error" });
  }
});

// ----------- GET /mcp/sse -----------
app.get("/mcp/sse", async (req: Request, res: Response) => {
  try {
    console.log("SSE client connected");

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),   // ✅ required
      enableJsonResponse: false                        // SSE mode
    });

    res.on("close", () => {
      console.log("SSE connection closed");
      transport.close();
    });

    await server.connect(transport);

    // ❗ Your version of StreamableHTTPServerTransport does NOT have handleSSE()
    // Instead use handleRequest() in SSE mode  
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("SSE error:", err);
    if (!res.headersSent)
      res.status(500).send("SSE error");
  }
});
