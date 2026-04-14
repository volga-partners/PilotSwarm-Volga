/**
 * Authentication middleware.
 * Extracts token → validates → upserts user → sets req.userId
 */

import { extractToken, validateToken, getAuthConfig } from "../services/authService.js";
import { upsertUser } from "../services/dbService.js";

export async function requireAuth(req, res, next) {
  const authConfig = getAuthConfig();

  // Auth disabled — allow through with null userId
  if (!authConfig) {
    req.userId = null;
    req.authClaims = null;
    return next();
  }

  // Extract token
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  // Validate token
  const userInfo = await validateToken(token);
  if (!userInfo) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  // Auto-provision user in database
  try {
    await upsertUser({
      id: userInfo.id,
      email: userInfo.email,
      displayName: userInfo.displayName,
      provider: userInfo.provider,
      providerId: userInfo.providerId,
    });
  } catch (err) {
    console.error("[requireAuth] Failed to upsert user:", err.message);
  }

  req.userId = userInfo.id;
  req.authClaims = userInfo;
  next();
}
