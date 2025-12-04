"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const streamableHttp_js_1 = require("@modelcontextprotocol/sdk/server/streamableHttp.js");
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
// -----------------------------------------------------------------------------
// 1. Create MCP Server
// -----------------------------------------------------------------------------
const server = new mcp_js_1.McpServer({
    name: "mcp-demo",
    version: "1.0.0",
});
// -----------------------------------------------------------------------------
// 2. TOOLS
// -----------------------------------------------------------------------------
// ➤ 2.1 Add Numbers Tool
server.registerTool("add_numbers", {
    title: "Addition Tool",
    description: "Adds two numbers and returns the result",
    inputSchema: {
        a: zod_1.z.number(),
        b: zod_1.z.number(),
    },
    outputSchema: {
        result: zod_1.z.number(),
    },
}, async ({ a, b }) => {
    const result = a + b;
    return {
        content: [{ type: "text", text: JSON.stringify({ result }) }],
        structuredContent: { result },
    };
});
// ➤ 2.2 Current IST Time
server.registerTool("current_time_ist", {
    title: "Current Time (IST)",
    description: "Returns date/time in Asia/Kolkata.",
    inputSchema: {},
    outputSchema: {
        iso: zod_1.z.string(),
        human: zod_1.z.string(),
    },
}, async () => {
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
});
// ➤ 2.3 Read File Tool
server.registerTool("read_project_file", {
    title: "Read Project File",
    description: "Reads a text file inside the project directory.",
    inputSchema: {
        relativePath: zod_1.z.string(),
    },
    outputSchema: {
        relativePath: zod_1.z.string(),
        absolutePath: zod_1.z.string(),
        content: zod_1.z.string(),
    },
}, async ({ relativePath }) => {
    const base = process.cwd();
    const absolutePath = path_1.default.resolve(base, relativePath);
    try {
        const content = await promises_1.default.readFile(absolutePath, "utf8");
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
    }
    catch (err) {
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
});
// ➤ 2.4 List Directory Tool
server.registerTool("list_project_directory", {
    title: "List Directory",
    description: "Lists files and directories in the project folder.",
    inputSchema: {
        relativePath: zod_1.z.string().optional(),
    },
    outputSchema: {
        directory: zod_1.z.string(),
        entries: zod_1.z.array(zod_1.z.object({
            name: zod_1.z.string(),
            type: zod_1.z.enum(["file", "directory", "other"]),
        })),
    },
}, async ({ relativePath }) => {
    const dirPath = path_1.default.resolve(process.cwd(), relativePath || ".");
    try {
        const files = await promises_1.default.readdir(dirPath, { withFileTypes: true });
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
    }
    catch (err) {
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
});
// -----------------------------------------------------------------------------
// 3. Resource Example
// -----------------------------------------------------------------------------
server.registerResource("greeting", new mcp_js_1.ResourceTemplate("greeting://{name}", { list: undefined }), {
    title: "Greeting Resource",
    description: "Returns a greeting message",
}, async (uri, { name }) => ({
    contents: [{ uri: uri.href, text: `Hello, ${name}!` }],
}));
// -----------------------------------------------------------------------------
// 4. EXPRESS + MCP (POST /mcp ONLY)
// -----------------------------------------------------------------------------
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.post("/mcp", async (req, res) => {
    console.log("MCP request received");
    const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto_1.default.randomUUID(),
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
app.listen(port, () => console.log(`🚀 MCP server running at http://0.0.0.0:${port}/mcp`));
