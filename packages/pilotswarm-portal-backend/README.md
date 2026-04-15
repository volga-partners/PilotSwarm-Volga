# PilotSwarm Portal Backend

Express + WebSocket backend API for the PilotSwarm web portal.

## Architecture

```
src/
├── index.js                  — Entry point, creates server, manages shutdown
├── app.js                    — Express app factory, mounts middleware + routes
├── config.js                 — Centralized environment variable configuration
├── controllers/              — Business logic per feature (session, message, model, user, system, artifact)
├── middlewares/              — Express middleware (requireAuth, errorHandler)
├── routes/                   — HTTP route definitions (health, auth-config, bootstrap, rpc, artifacts)
├── services/                 — Core services (auth, runtime, database)
├── validators/               — RPC method validation
└── websocket/                — WebSocket connection handler
```

## Features

- **Multi-Provider OAuth**: Microsoft Entra ID + Google via `validateToken()`
- **User Auto-Provisioning**: First login creates user in `pilotswarm_auth.users` table
- **Model Preferences**: Users can set default model, auto-applied to new sessions
- **Session Management**: Full CRUD via RPC (27 methods)
- **WebSocket Streaming**: Real-time session/log subscriptions
- **Proper Architecture**: Controllers, services, validators, middleware separation

## Environment Variables

```bash
# Server
PORT=3001
PORTAL_MODE=local  # or 'remote'
WORKERS=4

# Database (PostgreSQL)
DATABASE_URL=postgresql://...

# Authentication
ENTRA_TENANT_ID=...
ENTRA_CLIENT_ID=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# TLS (optional)
TLS_CERT_PATH=/path/to/cert.pem
TLS_KEY_PATH=/path/to/key.pem
```

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (with --watch)
npm run dev

# Start production server
npm start
```

## API Endpoints

- `GET /api/health` — Server status
- `GET /api/auth-config` — OAuth provider configuration (public)
- `GET /api/bootstrap` — Portal runtime metadata (auth required)
- `POST /api/rpc` — All 27+ RPC methods dispatched here (auth required)
- `GET /api/sessions/:id/artifacts/:file/download` — Artifact download (auth required)
- `WS /portal-ws` — WebSocket for real-time updates (optional auth)

## RPC Methods (27 total)

### Sessions
- `listSessions`, `createSession`, `createSessionForAgent`
- `getSession`, `getOrchestrationStats`, `getExecutionHistory`
- `renameSession`, `deleteSession`, `cancelSession`, `completeSession`
- `getSessionCreationPolicy`, `listCreatableAgents`
- `getSessionEvents`, `getSessionEventsBefore`

### Messages
- `sendMessage`, `sendAnswer`

### Models
- `listModels`, `getModelsByProvider`, `getDefaultModel`
- `updateSessionModel` (sets model on specific session)

### Users
- `getUserProfile` (returns user + defaultModel)
- `setUserDefaultModel` (saves user preference)

### System
- `getLogConfig`, `getWorkerCount`

### Artifacts
- `listArtifacts`, `downloadArtifact`, `exportExecutionHistory`

## Database

Uses two layers:
1. **PgSessionCatalogProvider** (from SDK) — existing session CRUD
2. **User table** (`pilotswarm_auth.users`) — backend-owned user management

Auto-creates schema and tables on startup. Safe migrations handle existing databases.

## WebSocket Messages

**Client → Server:**
- `{ type: "subscribeSession", sessionId: "..." }`
- `{ type: "unsubscribeSession", sessionId: "..." }`
- `{ type: "subscribeLogs" }`
- `{ type: "unsubscribeLogs" }`
- `{ type: "theme", themeId: "..." }`

**Server → Client:**
- `{ type: "ready" }`
- `{ type: "sessionEvent", sessionId, event }`
- `{ type: "logEntry", entry }`
- `{ type: "subscribedSession", sessionId }`
- `{ type: "subscribedLogs" }`
- `{ type: "themeAck", themeId }`
- `{ type: "error", scope, error }`
