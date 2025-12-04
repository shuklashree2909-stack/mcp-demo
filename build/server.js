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
// ------------------------------------------------------------
// 1. Create the MCP server
// ------------------------------------------------------------
const server = new mcp_js_1.McpServer({
    name: "mcp-demo",
    version: "1.0.0",
});
// ------------------------------------------------------------
// 2. MCP TOOLS
// ------------------------------------------------------------
// 2.1 Add numbers
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
// 2.2 Current time (IST)
server.registerTool("current_time_ist", {
    title: "Time Tool (IST)",
    description: "Returns the current time in Asia/Kolkata timezone.",
    inputSchema: {},
    outputSchema: {
        iso: zod_1.z.string(),
        human: zod_1.z.string(),
    },
}, async () => {
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
});
// 2.3 Read file
server.registerTool("read_project_file", {
    title: "Read Project File",
    description: "Reads a text file from the server project.",
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
    const abs = path_1.default.resolve(base, relativePath);
    try {
        const content = await promises_1.default.readFile(abs, "utf8");
        return {
            content: [{ type: "text", text: JSON.stringify({ relativePath, absolutePath: abs, content }) }],
            structuredContent: { relativePath, absolutePath: abs, content },
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: JSON.stringify({ relativePath, absolutePath: abs, error: err.message }) }],
            structuredContent: { relativePath, absolutePath: abs, error: err.message },
        };
    }
});
// 2.4 List directory
server.registerTool("list_project_directory", {
    title: "List Directory",
    description: "Lists files/folders inside a project directory.",
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
        const items = await promises_1.default.readdir(dirPath, { withFileTypes: true });
        const entries = items.map((i) => ({
            name: i.name,
            type: i.isDirectory() ? "directory" : i.isFile() ? "file" : "other",
        }));
        return {
            content: [{ type: "text", text: JSON.stringify({ directory: dirPath, entries }) }],
            structuredContent: { directory: dirPath, entries },
        };
    }
    catch (err) {
        return {
            content: [{ type: "text", text: JSON.stringify({ directory: dirPath, error: err.message }) }],
            structuredContent: { directory: dirPath, error: err.message },
        };
    }
});
// ------------------------------------------------------------
// 3. RESOURCE EXAMPLE
// ------------------------------------------------------------
server.registerResource("greeting", new mcp_js_1.ResourceTemplate("greeting://{name}", { list: undefined }), {
    title: "Greeting Resource",
    description: "Returns a greeting text.",
}, async (uri, { name }) => {
    return {
        contents: [
            {
                uri: uri.href,
                text: `Hello, ${name}!`,
            },
        ],
    };
});
// ------------------------------------------------------------
// 4. EXPRESS + MCP HTTP TRANSPORT
// ------------------------------------------------------------
const app = (0, express_1.default)();
app.use(express_1.default.json());
// ----------- POST /mcp -----------
app.post("/mcp", async (req, res) => {
    try {
        console.log("POST /mcp hit");
        const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(), // ✅ required
            enableJsonResponse: true // optional
        });
        res.on("close", () => transport.close());
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    }
    catch (err) {
        console.error("MCP POST error:", err);
        if (!res.headersSent)
            res.status(500).json({ error: "Internal MCP server error" });
    }
});
// ----------- GET /mcp/sse -----------
app.get("/mcp/sse", async (req, res) => {
    try {
        console.log("SSE client connected");
        const transport = new streamableHttp_js_1.StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(), // ✅ required
            enableJsonResponse: false // SSE mode
        });
        res.on("close", () => {
            console.log("SSE connection closed");
            transport.close();
        });
        await server.connect(transport);
        // ❗ Your version of StreamableHTTPServerTransport does NOT have handleSSE()
        // Instead use handleRequest() in SSE mode  
        await transport.handleRequest(req, res);
    }
    catch (err) {
        console.error("SSE error:", err);
        if (!res.headersSent)
            res.status(500).send("SSE error");
    }
});
