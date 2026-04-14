/**
 * Health check route — no auth required.
 */

import { Router } from "express";
import { getRuntimeService } from "../services/runtimeService.js";
import { config } from "../config.js";

const router = Router();

router.get("/api/health", (_req, res) => {
  const runtime = getRuntimeService();
  res.json({
    ok: true,
    started: runtime.started,
    mode: config.portalMode,
  });
});

export default router;
