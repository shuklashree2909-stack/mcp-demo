import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { Request, Response } from "express";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

// -----------------------------------------------------------------------------
// 1. Create the MCP server instance
// -----------------------------------------------------------------------------

const server = new McpServer({
  name: "mcp-demo",
  version: "1.0.0",
});

// -----------------------------------------------------------------------------
// 2. TOOLS
// -----------------------------------------------------------------------------

// 2.1 Simple math tool: add two numbers
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
    const output = { result: a + b };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(output),
        },
      ],
      structuredContent: output,
    };
  }
);

// 2.2 Time tool: current time in IST (Asia/Kolkata)
server.registerTool(
  "current_time_ist",
  {
    title: "Current Time in IST",
    description: "Returns the current date and time in Asia/Kolkata (IST).",
    inputSchema: {}, // no inputs
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

    const output = { iso, human };

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(output),
        },
      ],
      structuredContent: output,
    };
  }
);

// 2.3 Read a project file by relative path
server.registerTool(
  "read_project_file",
  {
    title: "Read Project File",
    description:
      "Reads a text file from the current project (relative to the server working directory).",
    inputSchema: {
      relativePath: z.string().describe("File path relative to the project root, e.g. 'src/server.ts'"),
    },
    outputSchema: {
      relativePath: z.string(),
      absolutePath: z.string(),
      content: z.string(),
    },
  },
  async ({ relativePath }) => {
    const basePath = process.cwd();
    const absolutePath = path.resolve(basePath, relativePath);

    try {
      const content = await fs.readFile(absolutePath, "utf8");

      const output = {
        relativePath,
        absolutePath,
        content,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output),
          },
        ],
        structuredContent: output,
      };
    } catch (error: any) {
      const output = {
        relativePath,
        absolutePath,
        error: error instanceof Error ? error.message : String(error),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output),
          },
        ],
        structuredContent: output,
      };
    }
  }
);

// 2.4 List files in a directory (non-recursive)
server.registerTool(
  "list_project_directory",
  {
    title: "List Project Directory",
    description:
      "Lists files and folders in a directory relative to the project root (non-recursive).",
    inputSchema: {
      relativePath: z
        .string()
        .optional()
        .describe("Directory path relative to project root, e.g. 'src'. Defaults to '.'"),
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
    const basePath = process.cwd();
    const dirPath = path.resolve(basePath, relativePath || ".");

    try {
      const dirEntries = await fs.readdir(dirPath, { withFileTypes: true });

      const entries = dirEntries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory()
          ? ("directory" as const)
          : entry.isFile()
          ? ("file" as const)
          : ("other" as const),
      }));

      const output = {
        directory: dirPath,
        entries,
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output),
          },
        ],
        structuredContent: output,
      };
    } catch (error: any) {
      const output = {
        directory: dirPath,
        entries: [] as any[],
        error: error instanceof Error ? error.message : String(error),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(output),
          },
        ],
        structuredContent: output,
      };
    }
  }
);

// -----------------------------------------------------------------------------
// 3. RESOURCE (optional demo): greeting://{name}
// -----------------------------------------------------------------------------

server.registerResource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  {
    title: "Greeting Resource",
    description: "Returns a friendly greeting for the given name",
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

// -----------------------------------------------------------------------------
// 4. Wire the MCP server into an Express HTTP endpoint using Streamable HTTP
// -----------------------------------------------------------------------------

const app = express();
app.use(express.json());

app.post("/mcp", async (req: Request, res: Response) => {
  try {
   
    // Create a new transport per request to avoid request ID collisions
    console.log("Request received");
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on("close", () => {
      transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal MCP server error" });
    }
  }
});

// -----------------------------------------------------------------------------
// 5. Start the Express HTTP server
// -----------------------------------------------------------------------------

const port = parseInt(process.env.PORT || "3000", 10); 

app.listen(port, () => {
    console.log(`MCP demo server running at http://0.0.0.0:${port}/mcp`);
  })
  .on("error", (error) => {
    console.error("Express server error:", error);
    process.exit(1);
  });
