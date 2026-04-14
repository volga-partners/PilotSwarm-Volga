# PilotSwarm Portal Frontend

Frontend-only repository for the PilotSwarm portal UI.

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Backend Contract

- HTTP API base path: `/api`
- WebSocket path: `/portal-ws`
- In development, Vite proxies both paths to `http://localhost:3001` (configured in `vite.config.ts`).
