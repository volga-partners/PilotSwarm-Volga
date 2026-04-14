/**
 * Model controller — handles model operations and session model updates.
 */

import { getRuntimeService } from "../services/runtimeService.js";
import { getCms, updateUserDefaultModel } from "../services/dbService.js";

export async function listModels(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("listModels", {}, req.userId);
  return res.json({ ok: true, result });
}

export async function getModelsByProvider(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("getModelsByProvider", {}, req.userId);
  return res.json({ ok: true, result });
}

export async function getDefaultModel(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("getDefaultModel", {}, req.userId);
  return res.json({ ok: true, result });
}

export async function updateSessionModel(req, res) {
  const cms = getCms();
  if (!cms) {
    return res.status(503).json({ ok: false, error: "Database not available" });
  }
  const { sessionId, model } = req.body?.params || {};
  if (!sessionId) {
    return res.status(400).json({ ok: false, error: "sessionId required" });
  }
  await cms.updateSession(String(sessionId), { model: model || null });
  return res.json({ ok: true, result: { sessionId, model: model || null } });
}
