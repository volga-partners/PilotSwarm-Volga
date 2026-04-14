/**
 * System controller — handles system-level operations.
 */

import { getRuntimeService } from "../services/runtimeService.js";

export async function getLogConfig(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("getLogConfig", {}, req.userId);
  return res.json({ ok: true, result });
}

export async function getWorkerCount(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("getWorkerCount", {}, req.userId);
  return res.json({ ok: true, result });
}
