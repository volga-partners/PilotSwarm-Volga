/**
 * Session controller — handles all session CRUD operations.
 * Critical: createSession injects defaultModel from user's profile.
 */

import { getRuntimeService } from "../services/runtimeService.js";
import { getUserProfile } from "../services/dbService.js";

export async function listSessions(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("listSessions", {}, req.userId);
  return res.json({ ok: true, result });
}

export async function createSession(req, res) {
  const runtime = getRuntimeService();
  const params = { ...(req.body?.params || {}) };

  // Inject user's default model if not specified
  if (!params.model && req.userId) {
    const profile = await getUserProfile(req.userId);
    if (profile?.defaultModel) {
      params.model = profile.defaultModel;
    }
  }

  const result = await runtime.call("createSession", params, req.userId);
  return res.json({ ok: true, result });
}

export async function createSessionForAgent(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("createSessionForAgent", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}

export async function getSession(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("getSession", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}

export async function getOrchestrationStats(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("getOrchestrationStats", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}

export async function getExecutionHistory(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("getExecutionHistory", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}

export async function renameSession(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("renameSession", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}

export async function deleteSession(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("deleteSession", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}

export async function cancelSession(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("cancelSession", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}

export async function completeSession(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("completeSession", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}

export async function getSessionCreationPolicy(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("getSessionCreationPolicy", {}, req.userId);
  return res.json({ ok: true, result });
}

export async function listCreatableAgents(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("listCreatableAgents", {}, req.userId);
  return res.json({ ok: true, result });
}

export async function getSessionEvents(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("getSessionEvents", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}

export async function getSessionEventsBefore(req, res) {
  const runtime = getRuntimeService();
  const result = await runtime.call("getSessionEventsBefore", req.body?.params || {}, req.userId);
  return res.json({ ok: true, result });
}
