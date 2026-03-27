#!/usr/bin/env node

import { parseArgs } from "node:util";
import { createContext } from "../src/context.js";
import { createMcpServer } from "../src/server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const { values } = parseArgs({
    options: {
        transport: { type: "string", default: "stdio" },
        port: { type: "string", default: "3100" },
        store: { type: "string" },
        plugin: { type: "string", multiple: true },
        "model-providers": { type: "string" },
        "log-level": { type: "string", default: "error" },
    },
});

const store = values.store ?? process.env.DATABASE_URL;
if (!store) {
    console.error("Error: --store <url> or DATABASE_URL env var is required.");
    process.exit(1);
}

const ctx = await createContext({
    store,
    modelProvidersPath: values["model-providers"],
    pluginDirs: values.plugin,
});

const server = createMcpServer(ctx);

if (values.transport === "stdio") {
    const transport = new StdioServerTransport();
    await server.connect(transport);
} else if (values.transport === "http") {
    const mcpKey = process.env.PILOTSWARM_MCP_KEY;
    if (!mcpKey) {
        console.error("Error: PILOTSWARM_MCP_KEY env var required for HTTP transport.");
        process.exit(1);
    }
    // Streamable HTTP transport (NOT the deprecated SSEServerTransport)
    const { StreamableHTTPServerTransport } = await import(
        "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const { randomUUID } = await import("node:crypto");
    const http = await import("node:http");
    const port = parseInt(values.port ?? "3100", 10);

    const httpServer = http.createServer(async (req, res) => {
        const auth = req.headers["authorization"];
        if (auth !== `Bearer ${mcpKey}`) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
        }

        if (req.url === "/mcp") {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
            });
            await server.connect(transport);
            await transport.handleRequest(req, res);
        } else {
            res.writeHead(404);
            res.end("Not found");
        }
    });

    httpServer.listen(port, "127.0.0.1", () => {
        console.error(`PilotSwarm MCP server listening on http://127.0.0.1:${port}/mcp`);
    });
} else {
    console.error(`Unknown transport: ${values.transport}. Use "stdio" or "http".`);
    process.exit(1);
}
