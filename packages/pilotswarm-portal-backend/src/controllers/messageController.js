/**
 * Message controller — handles message operations.
 */

import { getRuntimeService } from "../services/runtimeService.js";

export async function sendMessage(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("sendMessage", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}

export async function sendAnswer(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("sendAnswer", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}
