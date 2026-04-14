/**
 * Routes index — mounts all routers and serves static portal build in production.
 */

import fs from "node:fs";
import path from "node:path";
import express from "express";
import { fileURLToPath } from "node:url";

import healthRouter from "./health.js";
import authConfigRouter from "./authConfig.js";
import bootstrapRouter from "./bootstrap.js";
import rpcRouter from "./rpc.js";
import artifactsRouter from "./artifacts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve path to the portal's build output
const PORTAL_DIST = path.resolve(__dirname, "../../portal/dist");

export function mountRoutes(app) {
  // Mount API routers
  app.use(healthRouter);
  app.use(authConfigRouter);
  app.use(bootstrapRouter);
  app.use(rpcRouter);
  app.use(artifactsRouter);

  // In production: serve built portal static files
  if (fs.existsSync(PORTAL_DIST)) {
    app.use(express.static(PORTAL_DIST));
    // SPA fallback: return index.html for all non-API routes
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.sendFile(path.join(PORTAL_DIST, "index.html"));
    });
  }
}
