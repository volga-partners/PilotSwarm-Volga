# PilotSwarm Portal — Frontend + Backend Quick Start

This guide shows how to run the new **separate frontend and backend** together.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (React Frontend)                                  │
│  http://localhost:5173                                     │
│  packages/pilotswarm-portal-frontend                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP + WebSocket
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  Backend Server (Express + WebSocket)                       │
│  http://localhost:3001                                     │
│  packages/pilotswarm-portal-backend                        │
│  ├─ Auth Service (Microsoft + Google)                      │
│  ├─ Runtime Service (Workers)                              │
│  └─ Database Service (Sessions + Users)                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ↓
┌──────────────────────────────────────────────────────────────┐
│  Database + Workers                                         │
│  PostgreSQL (optional: DATABASE_URL)                        │
│  Embedded Workers (local mode)                              │
└──────────────────────────────────────────────────────────────┘
```

## Prerequisites

- Node.js 24+
- npm 10+
- (Optional) PostgreSQL for persistent storage
- (Optional) Microsoft Entra ID credentials (ENTRA_TENANT_ID, ENTRA_CLIENT_ID)
- (Optional) Google OAuth credentials (GOOGLE_CLIENT_ID)

## Step 1: Setup Backend

```bash
# Navigate to backend directory
cd packages/pilotswarm-portal-backend

# Install dependencies
npm install

# Create .env file (optional, uses defaults if not provided)
cat > .env << 'EOF'
# Server port
PORT=3001

# Authentication (optional — if not set, auth is disabled)
# ENTRA_TENANT_ID=your-tenant-id
# ENTRA_CLIENT_ID=your-client-id
# GOOGLE_CLIENT_ID=your-google-client-id

# Database (optional — if not set, uses in-memory SQLite)
# DATABASE_URL=postgresql://user:pass@localhost/db

# Worker mode
PORTAL_MODE=local
WORKERS=4
EOF

# Start backend
npm run dev
# Output: [portal-backend] PilotSwarm API at http://localhost:3001
```

Backend is now running on **http://localhost:3001**

✅ Test it:
```bash
curl http://localhost:3001/api/health
# Should return: {"ok":true,"started":false,"mode":"local"}
```

## Step 2: Setup Frontend

```bash
# Navigate to frontend directory (in another terminal)
cd packages/pilotswarm-portal-frontend

# Install dependencies
npm install

# The .env file is pre-configured
# Check that VITE_PORTAL_API_BASE_URL points to backend
cat .env | grep VITE_PORTAL_API_BASE_URL
# Should show: VITE_PORTAL_API_BASE_URL=http://localhost:3001

# Start frontend dev server
npm run dev
# Output: VITE v7.2.0 ready in 145 ms
#         ➜ Local:   http://localhost:5173/
```

Frontend is now running on **http://localhost:5173**

## Step 3: Test in Browser

1. Open **http://localhost:5173** in your browser
2. You should see the login screen (if auth is configured) or the portal (if auth is disabled)
3. If auth is enabled:
   - Click "Sign in with Microsoft" or "Sign in with Google"
   - Complete OAuth flow
   - You'll be redirected back to the portal
4. Create a new session
5. Send a message and see the response

## Running with Authentication

To enable authentication, set environment variables in backend `.env`:

### Microsoft Entra ID

```bash
# Get these from Azure Portal → App Registration
ENTRA_TENANT_ID=your-tenant-uuid
ENTRA_CLIENT_ID=your-client-id
```

Then in frontend, you'll see the Microsoft login button.

### Google OAuth

```bash
# Get this from Google Cloud Console
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Then in frontend, you'll see the Google login button.

## Running with Database

To persist sessions and users, configure PostgreSQL:

```bash
# In backend .env
DATABASE_URL=postgresql://user:password@localhost:5432/pilotswarm
```

Without this, data is stored in-memory (lost on restart).

## Troubleshooting

### Frontend can't connect to backend
```
Error: fetch failed
```
**Solution:**
- Verify backend is running on port 3001
- Check `VITE_PORTAL_API_BASE_URL` in frontend `.env` matches backend URL
- Run: `curl http://localhost:3001/api/health`

### "Auth disabled" message
```
This means ENTRA_TENANT_ID, ENTRA_CLIENT_ID, and GOOGLE_CLIENT_ID are all not set
```
**Solution:**
- Either configure auth credentials in backend `.env`
- Or click past the login screen (auth bypass mode)

### WebSocket connection fails
```
Error: WebSocket connection failed
```
**Solution:**
- Verify backend is running and listening
- Check browser DevTools → Network → WS
- Ensure WebSocket path is `/portal-ws`

### Workers not starting
```
[portal-backend] PilotSwarm API at http://localhost:3001
[portal-backend] Mode: local
```
**Solution:**
- Workers start on first API call, not on server startup
- Make a request to the backend (e.g., create a session)
- Then check `/api/health` again — should show `"started": true`

## Development Workflow

### Terminal 1: Backend
```bash
cd packages/pilotswarm-portal-backend
npm run dev
```

### Terminal 2: Frontend
```bash
cd packages/pilotswarm-portal-frontend
npm run dev
```

### Make Changes
- Edit frontend code → auto-reloads (Vite)
- Edit backend code → auto-restarts (Node --watch)

### Test Authentication
1. Start both servers
2. Open http://localhost:5173
3. If auth enabled, click login button
4. Complete OAuth flow
5. Verify token stored in browser localStorage

## Building for Production

### Frontend Build
```bash
cd packages/pilotswarm-portal-frontend
npm run build
# Output: dist/ directory with static files
```

### Backend Build
No build needed — Node runs `.js` files directly

### Deploy
1. Deploy frontend `dist/` to CDN or static hosting (Vercel, Netlify, S3, etc.)
2. Deploy backend as Node.js application (Heroku, Railway, EC2, etc.)
3. Update `VITE_PORTAL_API_BASE_URL` in frontend to point to production backend
4. Configure auth credentials in backend `.env` for production OAuth apps

## Available Commands

### Backend
```bash
npm run dev          # Start with --watch (auto-restart)
npm start            # Start production server
```

### Frontend
```bash
npm run dev          # Start Vite dev server
npm run build        # Build for production
npm run preview      # Preview production build locally
```

## What's Next?

1. ✅ Backend is running and creating workers on demand
2. ✅ Frontend connects to backend via REST + WebSocket
3. ✅ Authentication is set up (if configured)
4. 📝 Create sessions, send messages, try the portal
5. 🚀 Deploy to production (Vercel for frontend, Railway for backend)

## Documentation

- **Backend**: See `packages/pilotswarm-portal-backend/README.md`
- **Frontend Integration**: See `packages/pilotswarm-portal-frontend/BACKEND_INTEGRATION.md`
- **Architecture**: See `packages/pilotswarm-portal-backend/src/` for controller structure

## Support

For issues, check:
1. Backend logs for errors
2. Browser DevTools → Console for frontend errors
3. Network tab for API request failures
4. Check `.env` files are configured correctly
