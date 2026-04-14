/**
 * User controller — handles user profile and model preferences.
 */

import { getUserProfile, updateUserDefaultModel } from "../services/dbService.js";

export async function getUserProfile_(req, res) {
  const profile = await getUserProfile(req.userId);
  return res.json({ ok: true, result: profile });
}

export async function setUserDefaultModel(req, res) {
  const model = String(req.body?.params?.model || "").trim() || null;
  await updateUserDefaultModel(req.userId, model);
  return res.json({ ok: true, result: { model } });
}
