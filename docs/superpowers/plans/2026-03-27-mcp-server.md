# PilotSwarm MCP Server — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone MCP server package that exposes PilotSwarm's full control surface (sessions, agents, facts, models, skills) to any MCP-compatible client.

**Architecture:** A new `packages/mcp-server` workspace package that imports from `pilotswarm-sdk` and uses `@modelcontextprotocol/sdk` to serve tools, resources, and prompts over stdio or Streamable HTTP transports. It connects to PilotSwarm's PostgreSQL backend as a client — no embedded worker.

**API Notes (validated against MCP spec 2025-11-25 and SDK v1.28.0):**
- **CRITICAL:** Use `server.registerTool()`, `server.registerResource()`, `server.registerPrompt()` — the old `server.tool()`, `server.resource()`, `server.prompt()` methods are **deprecated** and must NOT be used
- Use `NodeStreamableHTTPServerTransport` from `@modelcontextprotocol/sdk/server/streamableHttp.js` for HTTP — SSE transport (`SSEServerTransport`) is **deprecated** since spec 2025-03-26 and must NOT be used
- Use `StdioServerTransport` from `@modelcontextprotocol/sdk/server/stdio.js` for stdio
- Use `ResourceTemplate` from `@modelcontextprotocol/sdk/server/mcp.js` for URI template resources (e.g., `pilotswarm://sessions/{id}`)
- Zod for input schemas; avoid `z.discriminatedUnion()` (silently dropped by SDK)
- Keep argument schemas flat (no nested objects), paginate large results
- Bind HTTP to `127.0.0.1` (not `0.0.0.0`) to prevent DNS rebinding attacks

**Web Search Requirement:** Before implementing any task that touches MCP SDK APIs (`registerTool`, `registerResource`, `registerPrompt`, transports, `ResourceTemplate`), the implementer MUST use WebSearch to verify the current API signatures against the official MCP TypeScript SDK docs and npm package. The MCP ecosystem evolves quickly — do NOT assume the code samples in this plan are 100% current. If you find discrepancies between this plan and the latest docs, follow the latest docs and note what changed.

**Tech Stack:** TypeScript (ES2022/NodeNext), `@modelcontextprotocol/sdk@^1.28.0`, `pilotswarm-sdk@^0.1.11`, Node.js >=24

---

## File Structure

```
packages/mcp-server/
├── package.json
├── tsconfig.json
├── bin/
│   └── pilotswarm-mcp.ts          # CLI entry point, arg parsing, transport init
└── src/
    ├── index.ts                     # Public API: createMcpServer() factory
    ├── server.ts                    # MCP server setup, registers all tools/resources/prompts
    ├── context.ts                   # ServerContext type + createContext() factory
    ├── tools/
    │   ├── sessions.ts              # 7 session management tools
    │   ├── agents.ts                # 3 agent operation tools
    │   ├── facts.ts                 # 3 facts store tools
    │   └── models.ts                # switch_model + send_command tools
    ├── resources/
    │   ├── sessions.ts              # sessions list, detail, messages
    │   ├── facts.ts                 # facts query
    │   └── models.ts                # models list
    ├── prompts/
    │   └── skills.ts                # Skills → MCP prompts adapter
    └── auth.ts                      # Bearer token middleware for HTTP
```

---

### Task 1: Package scaffolding and build

**Files:**
- Create: `packages/mcp-server/package.json`
- Create: `packages/mcp-server/tsconfig.json`
- Create: `packages/mcp-server/src/index.ts`
- Create: `packages/mcp-server/src/context.ts`

- [ ] **Step 1: Create `packages/mcp-server/package.json`**

```json
{
  "name": "pilotswarm-mcp-server",
  "version": "0.1.0",
  "type": "module",
  "description": "MCP server for PilotSwarm — exposes sessions, agents, facts, and models to MCP clients.",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "pilotswarm-mcp": "./dist/bin/pilotswarm-mcp.js"
  },
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.28.0",
    "pilotswarm-sdk": "^0.1.11"
  },
  "engines": {
    "node": ">=24.0.0"
  }
}
```

- [ ] **Step 2: Create `packages/mcp-server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": ".",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "bin/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `packages/mcp-server/src/context.ts`**

This is the shared context object that all tools/resources receive. It holds initialized SDK clients.

```typescript
import {
    PilotSwarmClient,
    PilotSwarmManagementClient,
    PgFactStore,
    createFactStoreForUrl,
    loadModelProviders,
    ModelProviderRegistry,
    loadSkills,
} from "pilotswarm-sdk";

export interface ServerContext {
    client: PilotSwarmClient;
    mgmt: PilotSwarmManagementClient;
    facts: PgFactStore;
    models: ModelProviderRegistry | null;
    skills: Array<{ name: string; description: string; prompt: string }>;
}

export interface CreateContextOptions {
    store: string;
    modelProvidersPath?: string;
    pluginDirs?: string[];
}

export async function createContext(opts: CreateContextOptions): Promise<ServerContext> {
    const client = new PilotSwarmClient({ store: opts.store });
    await client.start();

    const mgmt = new PilotSwarmManagementClient({ store: opts.store });
    await mgmt.start();

    const facts = (await createFactStoreForUrl(opts.store)) as PgFactStore;
    await facts.initialize();

    const models = loadModelProviders(opts.modelProvidersPath ?? undefined) ?? null;

    let skills: Array<{ name: string; description: string; prompt: string }> = [];
    if (opts.pluginDirs) {
        for (const dir of opts.pluginDirs) {
            try {
                const loaded = await loadSkills(dir + "/skills");
                skills.push(...loaded.map(s => ({ name: s.name, description: s.description, prompt: s.prompt })));
            } catch {
                // Directory may not have skills — skip
            }
        }
    }

    return { client, mgmt, facts, models, skills };
}
```

- [ ] **Step 4: Create `packages/mcp-server/src/index.ts`** (stub)

```typescript
export { createMcpServer } from "./server.js";
export { createContext } from "./context.js";
export type { ServerContext, CreateContextOptions } from "./context.js";
```

- [ ] **Step 5: Install dependencies and verify build**

```bash
cd packages/mcp-server && npm install && npm run build
```

Expected: Build succeeds with `dist/` output. May have empty `server.ts` export error — that's fine, we create it in Task 2.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat: scaffold mcp-server package with context factory"
```

---

### Task 2: MCP server core and CLI entry point

**Files:**
- Create: `packages/mcp-server/src/server.ts`
- Create: `packages/mcp-server/bin/pilotswarm-mcp.ts`
- Create: `packages/mcp-server/src/auth.ts`

- [ ] **Step 1: Create `packages/mcp-server/src/auth.ts`**

Bearer token auth middleware for HTTP transport.

```typescript
export function validateBearerToken(expectedToken: string | undefined) {
    return (req: { headers: Record<string, string | undefined> }): boolean => {
        if (!expectedToken) return true;
        const auth = req.headers["authorization"] ?? req.headers["Authorization"];
        return auth === `Bearer ${expectedToken}`;
    };
}
```

- [ ] **Step 2: Create `packages/mcp-server/src/server.ts`**

This is the core MCP server setup. It creates a `McpServer`, registers all tools/resources/prompts, and returns it.

```typescript
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
```

- [ ] **Step 3: Create `packages/mcp-server/bin/pilotswarm-mcp.ts`**

CLI entry point. Parses args, creates context, starts transport. Uses `StdioServerTransport` for stdio and `NodeStreamableHTTPServerTransport` for HTTP (NOT the deprecated `SSEServerTransport`).

```typescript
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
    const { NodeStreamableHTTPServerTransport } = await import(
        "@modelcontextprotocol/sdk/server/streamableHttp.js"
    );
    const { randomUUID } = await import("node:crypto");
    const http = await import("node:http");
    const port = parseInt(values.port ?? "3100", 10);

    const httpServer = http.createServer(async (req, res) => {
        // Auth check
        const auth = req.headers["authorization"];
        if (auth !== `Bearer ${mcpKey}`) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Unauthorized" }));
            return;
        }

        // Streamable HTTP uses a single /mcp endpoint
        if (req.url === "/mcp") {
            const transport = new NodeStreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
            });
            await server.connect(transport);
            await transport.handleRequest(req, res);
        } else {
            res.writeHead(404);
            res.end("Not found");
        }
    });

    // Bind to 127.0.0.1 (not 0.0.0.0) to prevent DNS rebinding attacks
    httpServer.listen(port, "127.0.0.1", () => {
        console.error(`PilotSwarm MCP server listening on http://127.0.0.1:${port}/mcp`);
    });
} else {
    console.error(`Unknown transport: ${values.transport}. Use "stdio" or "http".`);
    process.exit(1);
}
```

- [ ] **Step 4: Build and verify**

```bash
cd packages/mcp-server && npm run build
```

Expected: Clean build. `dist/bin/pilotswarm-mcp.js` exists.

- [ ] **Step 5: Smoke test stdio launch** (will fail to connect to DB but should parse args)

```bash
node packages/mcp-server/dist/bin/pilotswarm-mcp.js 2>&1 || true
```

Expected: `Error: --store <url> or DATABASE_URL env var is required.`

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat: MCP server core with stdio and Streamable HTTP transports"
```

---

### Task 3: Session management tools (7 tools)

**Files:**
- Create: `packages/mcp-server/src/tools/sessions.ts`
- Modify: `packages/mcp-server/src/server.ts` — import and call registration

- [ ] **Step 1: Create `packages/mcp-server/src/tools/sessions.ts`**

All tools use `server.registerTool()` (NOT the deprecated `server.tool()`). Each tool has `title`, `description`, and `inputSchema: z.object({...})`.

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";

export function registerSessionTools(server: McpServer, ctx: ServerContext) {

    server.registerTool(
        "create_session",
        {
            title: "Create Session",
            description: "Create a new PilotSwarm session",
            inputSchema: z.object({
                model: z.string().optional().describe("Qualified model name (e.g., github-copilot:claude-sonnet-4.6)"),
                agent: z.string().optional().describe("Agent name to bind the session to"),
                system_message: z.string().optional().describe("Custom system prompt"),
                title: z.string().optional().describe("Display title"),
            }),
        },
        async ({ model, agent, system_message, title }) => {
            try {
                const config: any = {};
                if (model) config.model = model;
                if (system_message) config.systemMessage = system_message;
                if (title) config.title = title;

                const session = agent
                    ? await ctx.client.createSessionForAgent(agent, config)
                    : await ctx.client.createSession(config);

                const info = await session.getInfo();
                return {
                    content: [{ type: "text" as const, text: JSON.stringify({
                        session_id: info.sessionId,
                        status: info.status,
                        model: info.model,
                        title: info.title,
                    }, null, 2) }],
                };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );

    server.registerTool(
        "send_message",
        {
            title: "Send Message",
            description: "Send a message to a session (fire-and-forget, returns immediately)",
            inputSchema: z.object({
                session_id: z.string().describe("Target session ID"),
                message: z.string().describe("User message"),
            }),
        },
        async ({ session_id, message }) => {
            try {
                await ctx.mgmt.sendMessage(session_id, message);
                return { content: [{ type: "text" as const, text: JSON.stringify({ sent: true }) }] };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );

    server.registerTool(
        "send_and_wait",
        {
            title: "Send and Wait",
            description: "Send a message and wait for the session to respond",
            inputSchema: z.object({
                session_id: z.string().describe("Target session ID"),
                message: z.string().describe("User message"),
                timeout_ms: z.number().optional().describe("Timeout in ms (default: 120000)"),
            }),
        },
        async ({ session_id, message, timeout_ms }) => {
            try {
                const session = await ctx.client.resumeSession(session_id);
                const response = await session.sendAndWait(message, timeout_ms ?? 120_000);
                return {
                    content: [{ type: "text" as const, text: JSON.stringify({
                        response: response ?? null,
                        status: (await session.getInfo()).status,
                    }, null, 2) }],
                };
            } catch (e: any) {
                if (e.message?.includes("timeout") || e.message?.includes("Timeout")) {
                    return { content: [{ type: "text" as const, text: JSON.stringify({ error: "timeout" }) }], isError: true };
                }
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );

    server.registerTool(
        "send_answer",
        {
            title: "Send Answer",
            description: "Answer a pending input_required question on a session",
            inputSchema: z.object({
                session_id: z.string().describe("Target session ID"),
                answer: z.string().describe("The answer to the pending question"),
            }),
        },
        async ({ session_id, answer }) => {
            try {
                await ctx.mgmt.sendAnswer(session_id, answer);
                return { content: [{ type: "text" as const, text: JSON.stringify({ sent: true }) }] };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );

    server.registerTool(
        "abort_session",
        {
            title: "Abort Session",
            description: "Cancel a running session's current orchestration",
            inputSchema: z.object({
                session_id: z.string().describe("Target session ID"),
                reason: z.string().optional().describe("Cancellation reason"),
            }),
        },
        async ({ session_id, reason }) => {
            try {
                await ctx.mgmt.cancelSession(session_id, reason);
                return { content: [{ type: "text" as const, text: JSON.stringify({ aborted: true }) }] };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );

    server.registerTool(
        "rename_session",
        {
            title: "Rename Session",
            description: "Rename a session",
            inputSchema: z.object({
                session_id: z.string().describe("Target session ID"),
                title: z.string().describe("New title"),
            }),
        },
        async ({ session_id, title }) => {
            try {
                await ctx.mgmt.renameSession(session_id, title);
                return { content: [{ type: "text" as const, text: JSON.stringify({ renamed: true }) }] };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );

    server.registerTool(
        "delete_session",
        {
            title: "Delete Session",
            description: "Delete a session and its data",
            inputSchema: z.object({
                session_id: z.string().describe("Target session ID"),
            }),
        },
        async ({ session_id }) => {
            try {
                await ctx.mgmt.deleteSession(session_id);
                return { content: [{ type: "text" as const, text: JSON.stringify({ deleted: true }) }] };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );
}
```

- [ ] **Step 2: Wire into server.ts**

Update `packages/mcp-server/src/server.ts`:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "./context.js";
import { registerSessionTools } from "./tools/sessions.js";

export function createMcpServer(ctx: ServerContext): McpServer {
    const server = new McpServer({
        name: "pilotswarm",
        version: "0.1.0",
    });

    registerSessionTools(server, ctx);

    return server;
}
```

- [ ] **Step 3: Build and verify**

```bash
cd packages/mcp-server && npm run build
```

Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/src/tools/sessions.ts packages/mcp-server/src/server.ts
git commit -m "feat: MCP session management tools (create, send, abort, rename, delete)"
```

---

### Task 4: Agent operation tools (3 tools)

**Files:**
- Create: `packages/mcp-server/src/tools/agents.ts`
- Modify: `packages/mcp-server/src/server.ts` — add import

- [ ] **Step 1: Create `packages/mcp-server/src/tools/agents.ts`**

Agent operations route through the parent session's orchestration via `sendCommand`. All tools use `server.registerTool()` (NOT the deprecated `server.tool()`).

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";

export function registerAgentTools(server: McpServer, ctx: ServerContext) {

    server.registerTool(
        "spawn_agent",
        {
            title: "Spawn Agent",
            description: "Spawn a sub-agent within a session",
            inputSchema: z.object({
                session_id: z.string().describe("Parent session ID"),
                task: z.string().describe("Task description for the agent"),
                agent_name: z.string().optional().describe("Named agent definition to use"),
                model: z.string().optional().describe("Model override for the agent"),
            }),
        },
        async ({ session_id, task, agent_name, model }) => {
            try {
                const args: any = { task };
                if (agent_name) args.agentName = agent_name;
                if (model) args.model = model;
                await ctx.mgmt.sendCommand(session_id, {
                    cmd: "spawn_agent",
                    id: `spawn-${Date.now()}`,
                    args,
                });
                return { content: [{ type: "text" as const, text: JSON.stringify({ sent: true, command: "spawn_agent" }) }] };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );

    server.registerTool(
        "message_agent",
        {
            title: "Message Agent",
            description: "Send a message to a running sub-agent",
            inputSchema: z.object({
                session_id: z.string().describe("Parent session ID"),
                agent_id: z.string().describe("Target agent ID"),
                message: z.string().describe("Message to send"),
            }),
        },
        async ({ session_id, agent_id, message }) => {
            try {
                await ctx.mgmt.sendCommand(session_id, {
                    cmd: "message_agent",
                    id: `msg-${Date.now()}`,
                    args: { agentId: agent_id, message },
                });
                return { content: [{ type: "text" as const, text: JSON.stringify({ sent: true }) }] };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );

    server.registerTool(
        "cancel_agent",
        {
            title: "Cancel Agent",
            description: "Cancel a running sub-agent",
            inputSchema: z.object({
                session_id: z.string().describe("Parent session ID"),
                agent_id: z.string().describe("Target agent ID"),
                reason: z.string().optional().describe("Cancellation reason"),
            }),
        },
        async ({ session_id, agent_id, reason }) => {
            try {
                await ctx.mgmt.sendCommand(session_id, {
                    cmd: "cancel_agent",
                    id: `cancel-${Date.now()}`,
                    args: { agentId: agent_id, reason },
                });
                return { content: [{ type: "text" as const, text: JSON.stringify({ cancelled: true }) }] };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );
}
```

- [ ] **Step 2: Wire into server.ts**

Add to `packages/mcp-server/src/server.ts`:

```typescript
import { registerAgentTools } from "./tools/agents.js";
// ... inside createMcpServer, after registerSessionTools:
registerAgentTools(server, ctx);
```

- [ ] **Step 3: Build and verify**

```bash
cd packages/mcp-server && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/src/tools/agents.ts packages/mcp-server/src/server.ts
git commit -m "feat: MCP agent operation tools (spawn, message, cancel)"
```

---

### Task 5: Facts tools (3 tools)

**Files:**
- Create: `packages/mcp-server/src/tools/facts.ts`
- Modify: `packages/mcp-server/src/server.ts` — add import

- [ ] **Step 1: Create `packages/mcp-server/src/tools/facts.ts`**

All tools use `server.registerTool()` (NOT the deprecated `server.tool()`).

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";

export function registerFactsTools(server: McpServer, ctx: ServerContext) {

    server.registerTool(
        "store_fact",
        {
            title: "Store Fact",
            description: "Store a fact in the PilotSwarm knowledge store",
            inputSchema: z.object({
                key: z.string().describe("Fact key (e.g., infra/server/fqdn)"),
                value: z.any().describe("JSON-serializable value"),
                tags: z.array(z.string()).optional().describe("Tags for querying"),
                shared: z.boolean().optional().describe("Cross-session visibility (default: false)"),
                session_id: z.string().optional().describe("Owning session ID"),
            }),
        },
        async ({ key, value, tags, shared, session_id }) => {
            try {
                const result = await ctx.facts.storeFact({
                    key,
                    value,
                    tags,
                    shared: shared ?? false,
                    sessionId: session_id,
                });
                return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );

    server.registerTool(
        "read_facts",
        {
            title: "Read Facts",
            description: "Query facts from the PilotSwarm knowledge store",
            inputSchema: z.object({
                key_pattern: z.string().optional().describe("SQL wildcard or glob pattern"),
                tags: z.array(z.string()).optional().describe("Filter by tags (all must match)"),
                session_id: z.string().optional().describe("Filter by session"),
                scope: z.enum(["accessible", "shared", "session", "descendants"]).optional().describe("Query scope"),
                limit: z.number().optional().describe("Max results (default: 50)"),
            }),
        },
        async ({ key_pattern, tags, session_id, scope, limit }) => {
            try {
                const query: any = {};
                if (key_pattern) query.keyPattern = key_pattern;
                if (tags) query.tags = tags;
                if (session_id) query.sessionId = session_id;
                if (limit) query.limit = limit;

                const access = scope ? { scope } : undefined;
                const result = await ctx.facts.readFacts(query, access);
                return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );

    server.registerTool(
        "delete_fact",
        {
            title: "Delete Fact",
            description: "Delete a fact from the PilotSwarm knowledge store",
            inputSchema: z.object({
                key: z.string().describe("Fact key to delete"),
                session_id: z.string().optional().describe("Owning session ID"),
            }),
        },
        async ({ key, session_id }) => {
            try {
                const result = await ctx.facts.deleteFact({ key, sessionId: session_id });
                return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );
}
```

- [ ] **Step 2: Wire into server.ts**

Add to `packages/mcp-server/src/server.ts`:

```typescript
import { registerFactsTools } from "./tools/facts.js";
// ... inside createMcpServer:
registerFactsTools(server, ctx);
```

- [ ] **Step 3: Build and verify**

```bash
cd packages/mcp-server && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/src/tools/facts.ts packages/mcp-server/src/server.ts
git commit -m "feat: MCP facts tools (store, read, delete)"
```

---

### Task 6: Model management and command tools (2 tools)

**Files:**
- Create: `packages/mcp-server/src/tools/models.ts`
- Modify: `packages/mcp-server/src/server.ts` — add import

- [ ] **Step 1: Create `packages/mcp-server/src/tools/models.ts`**

All tools use `server.registerTool()` (NOT the deprecated `server.tool()`).

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { ServerContext } from "../context.js";

export function registerModelTools(server: McpServer, ctx: ServerContext) {

    server.registerTool(
        "switch_model",
        {
            title: "Switch Model",
            description: "Change the model for a PilotSwarm session",
            inputSchema: z.object({
                session_id: z.string().describe("Target session ID"),
                model: z.string().describe("Qualified model name (e.g., github-copilot:claude-sonnet-4.6)"),
            }),
        },
        async ({ session_id, model }) => {
            try {
                await ctx.mgmt.sendCommand(session_id, {
                    cmd: "set_model",
                    id: `model-${Date.now()}`,
                    args: { model },
                });
                return { content: [{ type: "text" as const, text: JSON.stringify({ switched: true, model }) }] };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );

    server.registerTool(
        "send_command",
        {
            title: "Send Command",
            description: "Send an arbitrary orchestration command to a session",
            inputSchema: z.object({
                session_id: z.string().describe("Target session ID"),
                command: z.string().describe("Command name"),
                args: z.record(z.any()).optional().describe("Command arguments"),
            }),
        },
        async ({ session_id, command, args }) => {
            try {
                await ctx.mgmt.sendCommand(session_id, {
                    cmd: command,
                    id: `cmd-${Date.now()}`,
                    args,
                });
                return { content: [{ type: "text" as const, text: JSON.stringify({ sent: true, command }) }] };
            } catch (e: any) {
                return { content: [{ type: "text" as const, text: `Error: ${e.message}` }], isError: true };
            }
        }
    );
}
```

- [ ] **Step 2: Wire into server.ts**

Add to `packages/mcp-server/src/server.ts`:

```typescript
import { registerModelTools } from "./tools/models.js";
// ... inside createMcpServer:
registerModelTools(server, ctx);
```

- [ ] **Step 3: Build and verify**

```bash
cd packages/mcp-server && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/src/tools/models.ts packages/mcp-server/src/server.ts
git commit -m "feat: MCP model switch and send_command tools"
```

---

### Task 7: Session resources (3 resources)

**Files:**
- Create: `packages/mcp-server/src/resources/sessions.ts`
- Modify: `packages/mcp-server/src/server.ts` — add import

- [ ] **Step 1: Create `packages/mcp-server/src/resources/sessions.ts`**

All resources use `server.registerResource()` (NOT the deprecated `server.resource()`). For URI template resources (with `{id}`), use `new ResourceTemplate(...)` from `@modelcontextprotocol/sdk/server/mcp.js`.

```typescript
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";

export function registerSessionResources(server: McpServer, ctx: ServerContext) {

    // Static resource: list all sessions
    server.registerResource(
        "sessions-list",
        "pilotswarm://sessions",
        {
            title: "Sessions List",
            description: "List all PilotSwarm sessions with their current status",
            mimeType: "application/json",
        },
        async () => {
            const sessions = await ctx.mgmt.listSessions();
            const data = sessions.map(s => ({
                session_id: s.sessionId,
                title: s.title,
                status: s.status,
                model: s.model,
                agent_id: s.agentId,
                is_system: s.isSystem,
                created_at: s.createdAt,
                updated_at: s.updatedAt,
            }));
            return { contents: [{ uri: "pilotswarm://sessions", text: JSON.stringify(data, null, 2), mimeType: "application/json" }] };
        }
    );

    // URI template resource: session detail
    server.registerResource(
        "session-detail",
        new ResourceTemplate("pilotswarm://sessions/{id}", {
            list: async () => {
                const sessions = await ctx.mgmt.listSessions();
                return { resources: sessions.map(s => ({ uri: `pilotswarm://sessions/${s.sessionId}`, name: s.title ?? s.sessionId })) };
            },
        }),
        {
            title: "Session Detail",
            description: "Detailed info for a specific PilotSwarm session",
            mimeType: "application/json",
        },
        async (uri, { id }) => {
            const session = await ctx.mgmt.getSession(id);
            if (!session) {
                return { contents: [{ uri: uri.href, text: JSON.stringify({ error: "session not found" }), mimeType: "application/json" }] };
            }
            return { contents: [{ uri: uri.href, text: JSON.stringify(session, null, 2), mimeType: "application/json" }] };
        }
    );

    // URI template resource: session messages
    server.registerResource(
        "session-messages",
        new ResourceTemplate("pilotswarm://sessions/{id}/messages", {
            list: async () => {
                const sessions = await ctx.mgmt.listSessions();
                return { resources: sessions.map(s => ({ uri: `pilotswarm://sessions/${s.sessionId}/messages`, name: `${s.title ?? s.sessionId} messages` })) };
            },
        }),
        {
            title: "Session Messages",
            description: "Chat history for a PilotSwarm session",
            mimeType: "application/json",
        },
        async (uri, { id }) => {
            try {
                const dump = await ctx.mgmt.getSessionDump(id);
                const messages = dump?.events ?? [];
                return { contents: [{ uri: uri.href, text: JSON.stringify(messages, null, 2), mimeType: "application/json" }] };
            } catch {
                return { contents: [{ uri: uri.href, text: JSON.stringify([]), mimeType: "application/json" }] };
            }
        }
    );
}
```

- [ ] **Step 2: Wire into server.ts**

Add to `packages/mcp-server/src/server.ts`:

```typescript
import { registerSessionResources } from "./resources/sessions.js";
// ... inside createMcpServer:
registerSessionResources(server, ctx);
```

- [ ] **Step 3: Build and verify**

```bash
cd packages/mcp-server && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/src/resources/sessions.ts packages/mcp-server/src/server.ts
git commit -m "feat: MCP session resources (list, detail, messages)"
```

---

### Task 8: Facts and models resources

**Files:**
- Create: `packages/mcp-server/src/resources/facts.ts`
- Create: `packages/mcp-server/src/resources/models.ts`
- Modify: `packages/mcp-server/src/server.ts` — add imports

- [ ] **Step 1: Create `packages/mcp-server/src/resources/facts.ts`**

Uses `server.registerResource()` (NOT the deprecated `server.resource()`).

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";

export function registerFactsResources(server: McpServer, ctx: ServerContext) {

    server.registerResource(
        "facts-query",
        "pilotswarm://facts",
        {
            title: "Facts Query",
            description: "Query the PilotSwarm facts/knowledge store. Supports ?pattern=, &tags=, &scope=, &limit= query params.",
            mimeType: "application/json",
        },
        async (uri) => {
            const params = uri.searchParams;
            const query: any = {};
            const pattern = params.get("pattern");
            if (pattern) query.keyPattern = pattern;
            const tags = params.get("tags");
            if (tags) query.tags = tags.split(",");
            const limit = params.get("limit");
            if (limit) query.limit = parseInt(limit, 10);

            const scope = params.get("scope");
            const access = scope ? { scope } : undefined;

            const result = await ctx.facts.readFacts(query, access);
            return { contents: [{ uri: uri.href, text: JSON.stringify(result, null, 2), mimeType: "application/json" }] };
        }
    );
}
```

- [ ] **Step 2: Create `packages/mcp-server/src/resources/models.ts`**

Uses `server.registerResource()` (NOT the deprecated `server.resource()`).

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";

export function registerModelsResources(server: McpServer, ctx: ServerContext) {

    server.registerResource(
        "models-list",
        "pilotswarm://models",
        {
            title: "Models List",
            description: "Available LLM models grouped by provider",
            mimeType: "application/json",
        },
        async () => {
            if (!ctx.models) {
                return { contents: [{ uri: "pilotswarm://models", text: JSON.stringify({ error: "no model providers configured" }), mimeType: "application/json" }] };
            }
            const byProvider = ctx.models.getModelsByProvider();
            const data = byProvider.map((p: any) => ({
                provider_id: p.providerId,
                type: p.type,
                models: p.models.map((m: any) => ({
                    name: m.name,
                    description: m.description,
                    cost: m.cost,
                })),
            }));
            return { contents: [{ uri: "pilotswarm://models", text: JSON.stringify(data, null, 2), mimeType: "application/json" }] };
        }
    );
}
```

- [ ] **Step 3: Wire into server.ts**

Add to `packages/mcp-server/src/server.ts`:

```typescript
import { registerFactsResources } from "./resources/facts.js";
import { registerModelsResources } from "./resources/models.js";
// ... inside createMcpServer:
registerFactsResources(server, ctx);
registerModelsResources(server, ctx);
```

- [ ] **Step 4: Build and verify**

```bash
cd packages/mcp-server && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/src/resources/ packages/mcp-server/src/server.ts
git commit -m "feat: MCP facts and models resources"
```

---

### Task 9: Skills as MCP prompts

**Files:**
- Create: `packages/mcp-server/src/prompts/skills.ts`
- Modify: `packages/mcp-server/src/server.ts` — add import

- [ ] **Step 1: Create `packages/mcp-server/src/prompts/skills.ts`**

Uses `server.registerPrompt()` (NOT the deprecated `server.prompt()`).

```typescript
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "../context.js";

export function registerSkillPrompts(server: McpServer, ctx: ServerContext) {
    for (const skill of ctx.skills) {
        server.registerPrompt(
            `skill:${skill.name}`,
            {
                title: `Skill: ${skill.name}`,
                description: skill.description,
            },
            async () => ({
                messages: [{
                    role: "user" as const,
                    content: { type: "text" as const, text: skill.prompt },
                }],
            })
        );
    }
}
```

- [ ] **Step 2: Wire into server.ts**

Add to `packages/mcp-server/src/server.ts`:

```typescript
import { registerSkillPrompts } from "./prompts/skills.js";
// ... inside createMcpServer:
registerSkillPrompts(server, ctx);
```

- [ ] **Step 3: Build and verify**

```bash
cd packages/mcp-server && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add packages/mcp-server/src/prompts/skills.ts packages/mcp-server/src/server.ts
git commit -m "feat: MCP prompts from PilotSwarm skills"
```

---

### Task 10: Final server.ts assembly, build, and end-to-end smoke test

**Files:**
- Modify: `packages/mcp-server/src/server.ts` — ensure all registrations are wired

- [ ] **Step 1: Verify final `packages/mcp-server/src/server.ts`**

The file should now look like:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ServerContext } from "./context.js";
import { registerSessionTools } from "./tools/sessions.js";
import { registerAgentTools } from "./tools/agents.js";
import { registerFactsTools } from "./tools/facts.js";
import { registerModelTools } from "./tools/models.js";
import { registerSessionResources } from "./resources/sessions.js";
import { registerFactsResources } from "./resources/facts.js";
import { registerModelsResources } from "./resources/models.js";
import { registerSkillPrompts } from "./prompts/skills.js";

export function createMcpServer(ctx: ServerContext): McpServer {
    const server = new McpServer({
        name: "pilotswarm",
        version: "0.1.0",
    });

    // Tools
    registerSessionTools(server, ctx);
    registerAgentTools(server, ctx);
    registerFactsTools(server, ctx);
    registerModelTools(server, ctx);

    // Resources
    registerSessionResources(server, ctx);
    registerFactsResources(server, ctx);
    registerModelsResources(server, ctx);

    // Prompts
    registerSkillPrompts(server, ctx);

    return server;
}
```

- [ ] **Step 2: Full build**

```bash
cd packages/mcp-server && npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 3: Verify bin entry works**

```bash
node packages/mcp-server/dist/bin/pilotswarm-mcp.js 2>&1 || true
```

Expected: Shows error about missing --store (confirms the binary runs and parses args).

- [ ] **Step 4: Test stdio transport with real DB** (if local DB is running)

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | \
  DATABASE_URL="postgresql://localhost:5432/pilotswarm" node packages/mcp-server/dist/bin/pilotswarm-mcp.js 2>/dev/null | head -1
```

Expected: JSON response with `serverInfo: { name: "pilotswarm" }` and capabilities listing tools/resources/prompts.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp-server/
git commit -m "feat: complete MCP server with all tools, resources, and prompts"
```

---

### Task 11: Update monorepo root and documentation

**Files:**
- Modify: `package.json` (root) — workspaces already includes `packages/*`, verify
- Modify: `docs/superpowers/specs/2026-03-27-mcp-server-design.md` — mark as implemented

- [ ] **Step 1: Verify root package.json workspaces**

Read `package.json` at root — it has `"workspaces": ["packages/*"]` which already covers `packages/mcp-server`. No change needed.

- [ ] **Step 2: Run root-level build to verify integration**

```bash
npm run build
```

Expected: All packages build successfully including `packages/mcp-server`.

- [ ] **Step 3: Update spec status**

In `docs/superpowers/specs/2026-03-27-mcp-server-design.md`, change:

```markdown
**Status:** Approved
```

to:

```markdown
**Status:** Implemented
```

- [ ] **Step 4: Final commit**

```bash
git add package.json docs/superpowers/specs/2026-03-27-mcp-server-design.md
git commit -m "chore: integrate mcp-server into monorepo build"
```

---

## Summary

| Task | Description | Tools/Resources |
|------|-------------|-----------------|
| 1 | Package scaffolding + context factory | — |
| 2 | MCP server core + CLI entry + auth | — |
| 3 | Session management tools | 7 tools |
| 4 | Agent operation tools | 3 tools |
| 5 | Facts tools | 3 tools |
| 6 | Model + command tools | 2 tools |
| 7 | Session resources | 3 resources |
| 8 | Facts + models resources | 2 resources |
| 9 | Skills as prompts | N prompts |
| 10 | Final assembly + smoke test | — |
| 11 | Monorepo integration | — |

**Total: 15 tools, 5 resources, N prompts across 11 tasks.**

## API Reference (for implementers)

**DO NOT use these deprecated methods — they will produce deprecation warnings:**
- `server.tool()` — use `server.registerTool()` instead
- `server.resource()` — use `server.registerResource()` instead
- `server.prompt()` — use `server.registerPrompt()` instead
- `SSEServerTransport` — use `NodeStreamableHTTPServerTransport` instead

**Correct `registerTool` signature:**
```typescript
server.registerTool(
    "tool_name",
    {
        title: "Human-Readable Title",
        description: "What the tool does",
        inputSchema: z.object({
            param: z.string().describe("Param description"),
        }),
    },
    async ({ param }) => ({
        content: [{ type: "text" as const, text: "result" }],
    })
);
```

**Correct `registerResource` signature (static URI):**
```typescript
server.registerResource(
    "resource-id",
    "scheme://path",
    { title: "Title", description: "Desc", mimeType: "application/json" },
    async (uri) => ({ contents: [{ uri: uri.href, text: "data", mimeType: "application/json" }] })
);
```

**Correct `registerResource` signature (URI template):**
```typescript
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

server.registerResource(
    "resource-id",
    new ResourceTemplate("scheme://{param}/path", {
        list: async () => ({ resources: [{ uri: "scheme://value/path", name: "display" }] }),
    }),
    { title: "Title", description: "Desc", mimeType: "application/json" },
    async (uri, { param }) => ({ contents: [{ uri: uri.href, text: "data", mimeType: "application/json" }] })
);
```

**Correct `registerPrompt` signature:**
```typescript
server.registerPrompt(
    "prompt-name",
    { title: "Title", description: "Desc" },
    async () => ({
        messages: [{ role: "user" as const, content: { type: "text" as const, text: "prompt body" } }],
    })
);
```
