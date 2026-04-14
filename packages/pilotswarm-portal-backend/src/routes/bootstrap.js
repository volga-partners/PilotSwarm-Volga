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
    const bootstrap = await runtime.getBootstrap(req.userId);
    res.json({ ok: true, ...bootstrap });
  } catch (err) {
    next(err);
  }
});

export default router;
