/**
 * Artifact controller — handles artifact operations.
 */

import { getRuntimeService } from "../services/runtimeService.js";

export async function listArtifacts(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("listArtifacts", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}

export async function downloadArtifactRpc(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("downloadArtifact", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}

export async function exportExecutionHistory(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("exportExecutionHistory", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}
