/**
 * Auth config route — public, no auth required.
 * Returns OAuth provider configuration.
 */

import { Router } from "express";
import { getAuthConfig, validateToken } from "../services/authService.js";
import { getUserProfile } from "../services/dbService.js";

const router = Router();

router.get("/api/auth-config", (req, res) => {
  const authConfig = getAuthConfig();
  if (!authConfig) {
    return res.json({ enabled: false });
  }

  // Compute redirectUri dynamically from request
  const host = req.get("x-forwarded-host") || req.get("host");
  const proto = req.get("x-forwarded-proto") || req.protocol;
  const redirectUri = `${proto}://${host}`;

  const responseConfig = { ...authConfig };
  if (responseConfig.microsoft) {
    responseConfig.microsoft = { ...responseConfig.microsoft, redirectUri };
  }

  res.json(responseConfig);
});

/**
 * OAuth callback handler — exchanges auth code for token (if needed).
 * Frontend can also use the code/ID token directly as Bearer token.
 */
router.post("/api/oauth-callback", async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ ok: false, error: "code required" });
    }

    // For Microsoft/Google OAuth, the code or ID token should be sent by frontend
    // as Authorization: Bearer <token> header on subsequent requests
    // This endpoint is a hook for token exchange if needed (optional)
    // For now, just acknowledge the callback
    return res.json({ ok: true, token: code });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * Get current user profile — requires valid Bearer token.
 */
router.get("/api/user", async (req, res) => {
  try {
    const authConfig = getAuthConfig();
    if (!authConfig) {
      return res.status(401).json({ ok: false, error: "Auth disabled" });
    }

    // Extract and validate token
    const authHeader = req.get("authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const token = match[1];
    const userInfo = await validateToken(token);
    if (!userInfo) {
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    // Return user info
    return res.json({
      id: userInfo.id,
      email: userInfo.email,
      displayName: userInfo.displayName,
      provider: userInfo.provider,
      providerId: userInfo.providerId,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
