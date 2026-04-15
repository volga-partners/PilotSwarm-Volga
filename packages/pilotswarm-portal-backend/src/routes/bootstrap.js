/**
 * Bootstrap route — auth required.
 * Returns runtime metadata for the portal.
 */

import { Router } from "express";
import { requireAuth } from "../middlewares/index.js";
import { getRuntimeService } from "../services/runtimeService.js";

const router = Router();

router.get("/api/bootstrap", requireAuth, async (req, res, next) => {
  try {
    const runtime = getRuntimeService();
    const bootstrap = await runtime.getBootstrap();
    res.json({ ok: true, ...bootstrap });
  } catch (err) {
    const message = String(err?.message || "");
    if (message.includes("Portal runtime failed to start") || message.includes("DATABASE_URL")) {
      err.status = 503;
    }
    next(err);
  }
});

export default router;
