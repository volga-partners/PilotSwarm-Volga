# Frontend Integration with PilotSwarm Portal Backend

This document explains how the frontend integrates with the new `pilotswarm-portal-backend`.

## Overview

The frontend is a **separate React application** that communicates with the backend via REST APIs and WebSocket.

```
Frontend (React App)
    ↓
HTTP + WebSocket
    ↓
Backend (Express + WS)
    ↓
Database + Workers
```

## Configuration

### Backend URL

Set `VITE_PORTAL_API_BASE_URL` in `.env`:

```bash
# Development (backend on same machine)
VITE_PORTAL_API_BASE_URL=http://localhost:3001

# Production (backend deployed elsewhere)
VITE_PORTAL_API_BASE_URL=https://api.yourdomain.com
```

## API Endpoints Used by Frontend

### Authentication

**1. Get Auth Config** (public, no auth required)
```
GET /api/auth-config
Response: { enabled: bool, microsoft: {...}, google: {...} }
```
Used by: AuthProvider on mount
Purpose: Determine which OAuth providers are available

**2. OAuth Callback Handler** (public, no auth required)
```
POST /api/oauth-callback
Body: { code, state, codeVerifier }
Response: { ok: bool, token: string }
```
Used by: AuthContext after OAuth redirect
Purpose: Acknowledge OAuth callback, optionally exchange code for token

**3. Get Current User** (auth required)
```
GET /api/user
Headers: Authorization: Bearer <token>
Response: { id, email, displayName, provider, providerId }
```
Used by: AuthContext to fetch user profile
Purpose: Retrieve authenticated user's information

### Queries & Operations (via RPC)

**All other operations** (sessions, messages, models, etc.) go through:
```
POST /api/rpc
Headers: Authorization: Bearer <token>
Body: { method: string, params: object }
Response: { ok: bool, result: any }
```

Supported methods (27 total):
- `listSessions`, `createSession`, `getSession`, etc.
- `sendMessage`, `sendAnswer`
- `listModels`, `updateSessionModel`
- `getUserProfile`, `setUserDefaultModel`
- And more...

### Real-Time Updates (WebSocket)

```
WS /portal-ws
Protocol: access_token, <token>  (sub-protocol for auth)
```

Messages:
- `subscribeSession` → receive session events
- `subscribeLogs` → receive log entries
- `theme` → set UI theme

## OAuth Flow

### Microsoft (Entra ID)

1. Frontend calls `loginWithMicrosoft()`
2. Redirects to `https://login.microsoftonline.com/<tenant_id>/oauth2/v2.0/authorize`
3. User logs in, redirected back with `code`
4. Frontend extracts `code` from URL
5. Calls backend `/api/oauth-callback` with code
6. Calls `/api/user` with `code` as Bearer token
7. Backend validates token using `validateMicrosoftToken()`
8. Returns user info, frontend stores token + user

### Google

1. Frontend calls `loginWithGoogle()`
2. Redirects to `https://accounts.google.com/o/oauth2/v2/auth`
3. User logs in, redirected back with `code`
4. Frontend extracts `code` from URL
5. Calls backend `/api/oauth-callback` with code
6. Calls `/api/user` with `code` as Bearer token
7. Backend validates token using `validateGoogleToken()`
8. Returns user info, frontend stores token + user

## Backend Requirements

For the frontend to work, the backend must have:

✅ `/api/auth-config` endpoint (returns provider config)
✅ `/api/oauth-callback` endpoint (handles callback)
✅ `/api/user` endpoint (returns current user)
✅ `/api/rpc` endpoint (handles all RPC methods)
✅ `/api/health` endpoint (optional, for health checks)
✅ `WS /portal-ws` (WebSocket for real-time updates)

All endpoints except `/api/auth-config` and `/api/oauth-callback` require a valid Bearer token.

## Environment Variables

| Variable | Required | Example |
|----------|----------|---------|
| `VITE_PORTAL_API_BASE_URL` | ✅ Yes | `http://localhost:3001` |
| `GITHUB_TOKEN` | ❌ No | `ghp_...` |
| `VITE_DEV_PROXY_TARGET` | ❌ No (deprecated) | Ignored if `VITE_PORTAL_API_BASE_URL` is set |

## Starting the Frontend

```bash
# Install dependencies
npm install

# Development mode (with Vite dev server)
npm run dev
# Server runs on http://localhost:5173

# Build for production
npm run build
# Output in dist/

# Preview production build
npm run preview
```

## Development Workflow

### Terminal 1: Start Backend
```bash
cd packages/pilotswarm-portal-backend
npm run dev
# Listens on http://localhost:3001
```

### Terminal 2: Start Frontend
```bash
cd packages/pilotswarm-portal-frontend
# Ensure .env has VITE_PORTAL_API_BASE_URL=http://localhost:3001
npm run dev
# Listens on http://localhost:5173
```

### Terminal 3: (Optional) Monitor Logs
```bash
# Watch database or backend logs if needed
```

### Visit Frontend
```
Open http://localhost:5173 in browser
```

## Troubleshooting

### CORS Errors
- Ensure backend is running on the correct port (default: 3001)
- Check `VITE_PORTAL_API_BASE_URL` matches backend URL
- Backend should have `app.use(express.json())` configured

### Authentication Fails
- Verify OAuth provider config in backend (ENTRA_TENANT_ID, GOOGLE_CLIENT_ID)
- Check token is being sent in `Authorization: Bearer <token>` header
- Verify token is valid using backend's `validateToken()`

### WebSocket Connection Fails
- Check `/portal-ws` endpoint is available
- Verify WebSocket sub-protocol is being sent: `access_token, <token>`
- Look at browser DevTools → Network → WS

### Model/Session Data Empty
- Ensure backend has database configured (DATABASE_URL env var)
- Verify worker processes started (check backend logs)
- Call `/api/health` to confirm backend is running

## API Client Helpers

The frontend includes utility functions in `src/lib/auth.ts`:

```typescript
// Get API base URL
getApiBaseUrl(): string

// Fetch auth config
fetchAuthConfig(): Promise<AuthConfig>

// Token management
storeToken(token)
getStoredToken(): string | null
clearToken(): void

// User management
storeUser(user)
getStoredUser(): User | null
clearUser(): void

// OAuth flows
loginWithMicrosoft(config)
loginWithGoogle(config)
handleOAuthCallback(code, state): Promise<string>
logout(): void
```

## Security Notes

- Tokens are stored in `localStorage` — consider using `sessionStorage` for higher security
- Bearer token is sent in `Authorization` header — ensure HTTPS in production
- PKCE is used for OAuth code exchange to prevent code interception
- Backend validates all tokens against OAuth provider public keys

## Next Steps

1. Start backend: `npm run dev` in `packages/pilotswarm-portal-backend`
2. Start frontend: `npm run dev` in `packages/pilotswarm-portal-frontend`
3. Test OAuth login with Microsoft or Google
4. Verify session creation and messaging works
5. Deploy frontend + backend together (or separately with CORS headers)
