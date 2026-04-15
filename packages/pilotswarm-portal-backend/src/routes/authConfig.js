/**
 * Auth config route — public, no auth required.
 * Returns OAuth provider configuration.
 */

import { Router } from "express";
import { getAuthConfig, getGoogleConfig, validateToken } from "../services/authService.js";

const router = Router();

function getFirstForwardedValue(value) {
  return String(value || "")
    .split(",")[0]
    .trim();
}

function getRequestOrigin(req) {
  const origin = req.get("origin");
  if (origin && /^https?:\/\//i.test(origin)) {
    return origin;
  }

  const host = getFirstForwardedValue(req.get("x-forwarded-host") || req.get("host"));
  const proto = getFirstForwardedValue(req.get("x-forwarded-proto") || req.protocol);
  if (!host) return null;
  return `${proto || "http"}://${host}`;
}

function isLikelyJwt(value) {
  return typeof value === "string" && value.split(".").length === 3;
}

async function exchangeGoogleCode({ code, codeVerifier, redirectUri }) {
  console.log("[exchangeGoogleCode] Starting token exchange...");
  const googleConfig = getGoogleConfig();
  if (!googleConfig?.clientId || !googleConfig?.clientSecret) {
    console.error("[exchangeGoogleCode] Missing Google credentials");
    return null;
  }

  const params = new URLSearchParams({
    client_id: googleConfig.clientId,
    client_secret: googleConfig.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });
  if (codeVerifier) {
    params.set("code_verifier", codeVerifier);
  }

  console.log("[exchangeGoogleCode] Calling Google token endpoint...");
  console.log("[exchangeGoogleCode] redirectUri:", redirectUri);

  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const rawBody = await response.text();
    console.log("[exchangeGoogleCode] Response status:", response.status);

    let payload;
    try {
      payload = rawBody ? JSON.parse(rawBody) : {};
    } catch (e) {
      console.error("[exchangeGoogleCode] Failed to parse response:", rawBody);
      payload = {};
    }

    if (!response.ok) {
      const details = payload.error_description || payload.error || `HTTP ${response.status}`;
      console.error("[exchangeGoogleCode] Token exchange failed:", details);
      throw new Error(`Google token exchange failed: ${details}`);
    }

    if (!payload.id_token) {
      console.error("[exchangeGoogleCode] No id_token in response:", Object.keys(payload));
      throw new Error("Google token exchange did not return id_token");
    }

    console.log("[exchangeGoogleCode] Token exchange successful!");
    return payload.id_token;
  } catch (err) {
    console.error("[exchangeGoogleCode] Exception:", err.message);
    throw err;
  }
}

router.get("/api/auth-config", (req, res) => {
  const authConfig = getAuthConfig();
  if (!authConfig) {
    return res.json({ enabled: false });
  }

  // Compute redirectUri dynamically from request
  const redirectUri = getRequestOrigin(req);

  const responseConfig = { ...authConfig };
  if (responseConfig.microsoft && redirectUri) {
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
    const { code, codeVerifier, redirectUri } = req.body || {};
    console.log("[/api/oauth-callback] Received code:", code?.substring(0, 20) + "...");
    console.log("[/api/oauth-callback] redirectUri:", redirectUri);

    if (!code) {
      return res.status(400).json({ ok: false, error: "code required" });
    }

    // Some flows send an ID token directly. If it already looks like a JWT, return as-is.
    if (isLikelyJwt(code)) {
      console.log("[/api/oauth-callback] Code is already a JWT, returning as-is");
      return res.json({ ok: true, token: code });
    }

    // Google OAuth code flow: exchange the authorization code for id_token.
    const resolvedRedirectUri = redirectUri || getRequestOrigin(req);
    console.log("[/api/oauth-callback] Resolved redirectUri:", resolvedRedirectUri);

    if (resolvedRedirectUri) {
      console.log("[/api/oauth-callback] Exchanging code for token...");
      const idToken = await exchangeGoogleCode({
        code,
        codeVerifier,
        redirectUri: resolvedRedirectUri,
      });
      if (idToken) {
        console.log("[/api/oauth-callback] Successfully exchanged code for idToken");
        return res.json({ ok: true, token: idToken });
      }
    }

    // Backward-compatible fallback when token exchange is not configured.
    console.log("[/api/oauth-callback] Returning code as fallback token");
    return res.json({ ok: true, token: code });
  } catch (err) {
    console.error("[/api/oauth-callback] Error:", err.message);
    console.error("[/api/oauth-callback] Stack:", err.stack);
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
      console.log("[/api/user] Auth disabled");
      return res.status(401).json({ ok: false, error: "Auth disabled" });
    }

    // Extract and validate token
    const authHeader = req.get("authorization") || "";
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      console.log("[/api/user] No Bearer token in Authorization header");
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const token = match[1];
    console.log("[/api/user] Validating token...");
    const userInfo = await validateToken(token);
    if (!userInfo) {
      console.log("[/api/user] Token validation failed");
      return res.status(401).json({ ok: false, error: "Invalid token" });
    }

    console.log("[/api/user] Token validated for user:", userInfo.id);
    // Return user info
    return res.json({
      id: userInfo.id,
      email: userInfo.email,
      displayName: userInfo.displayName,
      provider: userInfo.provider,
      providerId: userInfo.providerId,
    });
  } catch (err) {
    console.error("[/api/user] Error:", err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
