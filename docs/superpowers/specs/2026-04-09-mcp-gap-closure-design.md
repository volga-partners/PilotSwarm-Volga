# Design: MCP Server Gap Closure

## Status

Proposed — 2026-04-09

## Problem

The `packages/mcp-server` implementation covers ~75% of the [MCP Server & Companion Agent proposal](../../proposals-impl/mcp-server-and-agent.md) and exceeds it in several areas (agent tools, fact writes, send_and_wait, skill prompts). However, 9 gaps remain between the proposal and the implementation. This spec describes how to close every gap while preserving the implementation's improvements over the proposal.

## Approach

**Keep the current fine-grained tool decomposition** (which is better for MCP hosts than the proposal's combined tools) and add the missing capabilities. No tools will be consolidated or renamed — only additions.

All gaps are implementable with existing SDK methods (`PilotSwarmManagementClient` already exposes `getSessionEvents`, `waitForStatusChange`, `getLatestResponse`, `dumpSession`, `getSessionStatus`). No SDK changes are required.

---

## Gap 1: `get_session_events` Tool (HIGH)

### What's Missing

The proposal's most impactful tool — paginated CMS event stream with optional long-poll for status changes. Currently there's no way to read session events via an MCP tool (only the `session-messages` resource, which dumps all events with no paging).

### Design

New tool in `tools/sessions.ts`:

```
get_session_events(session_id, after_seq?, limit?, wait?, wait_timeout_ms?, after_version?)
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `session_id` | string | required | Session to read events for |
| `after_seq` | number | — | Return events after this CMS sequence number |
| `limit` | number | 50 | Max events to return |
| `wait` | boolean | false | If true, long-poll until new events or status change |
| `wait_timeout_ms` | number | 30000 | Long-poll timeout |
| `after_version` | number | — | For wait mode: block until `customStatusVersion` exceeds this |

**Non-wait mode**: calls `ctx.mgmt.getSessionEvents(sessionId, afterSeq, limit)`. Returns `{ events, latestSeq }`.

**Wait mode**: calls `ctx.mgmt.waitForStatusChange(sessionId, afterVersion, 1000, waitTimeoutMs)`, then fetches events with `getSessionEvents(sessionId, afterSeq, limit)`. Returns `{ events, latestSeq, statusChange }`. If `after_version` is omitted in wait mode, the tool first fetches the current `customStatusVersion` via `getSessionStatus()` and waits for the next change after that.

The `wait` mode enables efficient polling: the MCP host calls once, blocks up to 30s, gets back events + status. No busy-loop needed.

---

## Gap 2: `get_session` Include Options (MEDIUM)

### What's Missing

The current `get_session_detail` tool returns basic session info but can't optionally include the latest LLM response, orchestration status, or session dump.

### Design

Add optional `include` parameter to the existing `get_session_detail` tool:

```
get_session_detail(session_id, include?: ["status", "response", "dump"])
```

| Include Value | SDK Method | What it Adds |
|---|---|---|
| `"status"` | `ctx.mgmt.getSessionStatus(sessionId)` | Orchestration status, customStatusVersion |
| `"response"` | `ctx.mgmt.getLatestResponse(sessionId)` | Latest KV-backed LLM response payload |
| `"dump"` | `ctx.mgmt.dumpSession(sessionId)` | Full Markdown dump of session + descendants |

When `include` is omitted, behavior is unchanged (backward compatible). Each included section is added as a top-level key in the response JSON.

---

## Gap 3: `list_models` Tool (LOW)

### What's Missing

Models are only available as a resource (`pilotswarm://models`), not as a tool. MCP hosts strongly prefer tools over resources for LLM-driven interactions.

### Design

New tool in `tools/models.ts`:

```
list_models(group_by_provider?)
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `group_by_provider` | boolean | false | If true, return models grouped by provider |

Delegates to `ctx.models.getModelsByProvider()` — same logic as the existing resource. Returns flat array or grouped structure based on param.

---

## Gap 4: System Agent Resources (MEDIUM)

### What's Missing

No dedicated URI templates for well-known system agents (sweeper, resourcemgr, facts-manager). Users must know session IDs to inspect them.

### Design

New resources in `resources/agents.ts`:

| Resource URI | Resolution |
|---|---|
| `pilotswarm://agents/sweeper` | Find session where `agentId === "sweeper"` |
| `pilotswarm://agents/sweeper/events` | Get events for sweeper session |
| `pilotswarm://agents/resourcemgr` | Find session where `agentId === "resourcemgr"` |
| `pilotswarm://agents/resourcemgr/events` | Get events for resourcemgr session |
| `pilotswarm://agents/facts-manager` | Find session where `agentId === "facts-manager"` |
| `pilotswarm://agents/facts-manager/events` | Get events for facts-manager session |

**Resolution strategy**: `listSessions()` → find session with matching `agentId` and `isSystem: true` → use that session's ID for `getSession()` or `getSessionEvents()`. Returns 404-like error content if the system agent isn't running.

Implementation: a helper `resolveSystemAgent(agentId)` that does the lookup once, then each resource handler uses it.

---

## Gap 5: Facts Pipeline Resources (LOW)

### What's Missing

The proposal defined structured URIs for skills, asks, and intake. Currently only a generic `pilotswarm://facts` resource exists.

### Design

New resources in `resources/facts.ts`:

| Resource URI | Key Pattern | Description |
|---|---|---|
| `pilotswarm://facts/skills` | `skills/%` | All promoted skills |
| `pilotswarm://facts/skills/{key}` | exact key | Single skill detail |
| `pilotswarm://facts/asks` | `asks/%` | Open asks |
| `pilotswarm://facts/asks/{key}` | exact key | Single ask detail |
| `pilotswarm://facts/intake` | `intake/%` | Recent intake (limit 50) |
| `pilotswarm://facts/intake/{keyPattern}` | pattern | Filtered intake |

All delegate to `ctx.facts.readFacts({ keyPattern, limit })`. The `{key}` and `{keyPattern}` are URI template variables.

---

## Gap 6: Resource Subscriptions (MEDIUM)

### What's Missing

No real-time push notifications when resources change. The MCP spec supports `resources/subscribe` → `notifications/resources/updated`.

### Design

The `McpServer.server` (lower-level `Server` instance) exposes `sendResourceUpdated(params)`. We'll add a lightweight polling background loop that detects changes and pushes notifications.

**Approach**: On server startup, start an optional background poller (configurable interval, default 5s) that:

1. Polls `listSessions()` and compares `updatedAt` timestamps against a cache
2. For any changed session, emits `sendResourceUpdated({ uri: "pilotswarm://sessions/{id}" })`
3. For system agents, also emits their dedicated URI updates
4. For facts, polls facts store `updatedAt` and emits skill/ask resource updates

**Opt-in**: The poller only starts if at least one client has subscribed to a resource. We track subscription state via the MCP SDK's subscribe/unsubscribe handlers.

**Scoped behavior by transport**: For stdio (single client), the poller activates once the client subscribes. For HTTP (multi-session), each MCP session manages its own subscription set, and the poller runs if any session has active subscriptions.

> **Note**: This is best-effort push — the poller interval means updates may be delayed up to the poll interval. This is acceptable for a management surface. The `get_session_events` tool with `wait: true` remains the primary mechanism for real-time monitoring.

---

## Gap 7: Companion `.agent.md` (MEDIUM)

### What's Missing

No operator agent template that teaches the LLM how to use the MCP tools conversationally.

### Design

Create `templates/builder-agents/agents/pilotswarm-operator.agent.md` with:

**Frontmatter**:
```yaml
name: pilotswarm-operator
description: Manage PilotSwarm sessions, agents, and knowledge pipeline via MCP
tools:
  - create_session
  - list_sessions
  - get_session_detail
  - get_session_events
  - send_message
  - send_and_wait
  - send_answer
  - abort_session
  - rename_session
  - delete_session
  - spawn_agent
  - message_agent
  - list_agents
  - cancel_agent
  - switch_model
  - list_models
  - send_command
  - read_facts
  - store_fact
  - delete_fact
```

**Prompt sections**:
1. **Session lifecycle** — how to list, inspect, message, answer, cancel, delete
2. **Status interpretation** — what idle/running/waiting/dehydrated/completed/failed mean
3. **Agent awareness** — sessions→agents mapping, parent/child, system vs user
4. **Event reading** — paging with `after_seq`, long-poll with `wait: true`
5. **Knowledge pipeline** — when to read/write facts, scopes
6. **Model selection** — list models, switch, understand providers
7. **Common patterns** — "check on session X", "what's the swarm doing", "send a task to agent Y"

---

## Gap 8: `agentId` Filter on `list_sessions` (LOW)

### What's Missing

Proposal had `agentId` filter. Current implementation only has `status_filter` and `include_system`.

### Design

Add `agent_id` parameter to `list_sessions`:

```
list_sessions(status_filter?, include_system?, agent_id?)
```

One line addition: `if (agent_id) sessions = sessions.filter(s => s.agentId === agent_id);`

---

## Gap 9: `prompt` Parameter on `create_session` (LOW)

### What's Missing

Proposal had a `prompt` parameter that sends an initial message immediately after session creation.

### Design

Add optional `prompt` parameter to `create_session`. When provided, after session creation, fire `session.send(prompt)` (non-blocking). The tool returns immediately with the session ID — the MCP host can then use `get_session_events` with `wait: true` or `send_and_wait` to observe the response.

Return value is unchanged: `{ session_id, status: "created", model, title, prompt_sent: true }` — the `prompt_sent` field indicates a prompt was fired.

---

## File Changes Summary

| File | Change Type | Description |
|---|---|---|
| `src/tools/sessions.ts` | **Modify** | Add `get_session_events` tool, add `include` to `get_session_detail`, add `agent_id` to `list_sessions`, add `prompt` to `create_session` |
| `src/tools/models.ts` | **Modify** | Add `list_models` tool |
| `src/resources/agents.ts` | **New file** | System agent resources (sweeper, resourcemgr, facts-manager) |
| `src/resources/facts.ts` | **Modify** | Add structured facts pipeline resources (skills, asks, intake) |
| `src/resources/subscriptions.ts` | **New file** | Background poller + subscription tracking for resource updates |
| `src/server.ts` | **Modify** | Register new resources and subscriptions |
| `src/context.ts` | **Modify** | No changes needed (existing context has all required clients) |
| `templates/.../pilotswarm-operator.agent.md` | **New file** | Companion agent template |

---

## Testing Strategy

1. **Existing MCP test scripts** (`test-mcp-tools.mjs`, `test-mcp-verify.mjs`, `test-mcp-edge-cases.mjs`) — run to verify no regressions
2. **Manual smoke test** with MCP Inspector: `PILOTSWARM_STORE=... npx pilotswarm-mcp --transport stdio` piped to inspector
3. **New tool tests**: `get_session_events` paging, long-poll timeout, include options on `get_session_detail`
4. **Resource verification**: system agent resolution, facts pipeline URIs

---

## Implementation Order

1. **Gap 1** — `get_session_events` tool (highest impact, unblocks monitoring workflows)
2. **Gap 2** — `get_session_detail` include options (enriches session inspection)
3. **Gap 8 + 9** — Minor `list_sessions` and `create_session` param additions (quick wins)
4. **Gap 3** — `list_models` tool (small addition)
5. **Gap 4** — System agent resources (new file, moderate effort)
6. **Gap 5** — Facts pipeline resources (extend existing file)
7. **Gap 6** — Resource subscriptions (most complex, new background loop)
8. **Gap 7** — Companion agent template (documentation, no runtime code)
