/**
 * Artifact download route — auth required.
 * Returns binary file content.
 */

import { Router } from "express";
import path from "node:path";
import { requireAuth } from "../middlewares/index.js";
import { getRuntimeService } from "../services/runtimeService.js";

const router = Router();

router.get(
  "/api/sessions/:sessionId/artifacts/:filename/download",
  requireAuth,
  async (req, res, next) => {
    try {
      const { sessionId, filename } = req.params;
      const runtime = getRuntimeService();
      const content = await runtime.downloadArtifact(sessionId, filename, req.userId);
      res.setHeader("content-type", "text/plain; charset=utf-8");
      res.setHeader(
        "content-disposition",
        `attachment; filename="${path.basename(filename)}"`
      );
      res.send(content);
    } catch (err) {
      err.status = 404;
      next(err);
    }
  }
);

export default router;
