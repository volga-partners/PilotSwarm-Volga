import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "./context.js";

export function createMcpServer(ctx: ServerContext): McpServer {
    const server = new McpServer({
        name: "pilotswarm",
        version: "0.1.0",
    });

    // Tools, resources, and prompts are registered in subsequent tasks.
    // Each registration module receives `server` and `ctx`.

    return server;
}
