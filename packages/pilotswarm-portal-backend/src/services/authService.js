/**
 * Multi-provider OAuth token validation service.
 * Supports Microsoft (Entra ID) via jose + Google via google-auth-library.
 * Returns normalized user info: { id, email, displayName, provider, providerId }
 */

import { jwtVerify } from "jose";
import { OAuth2Client } from "google-auth-library";
import { config } from "../config.js";

let _microsoftJwks = null;

/**
 * Get Microsoft config from env vars.
 * Returns null if ENTRA_TENANT_ID or ENTRA_CLIENT_ID not set.
 */
export function getMicrosoftConfig() {
  const { tenantId, clientId } = config.auth.entra;
  if (!tenantId || !clientId) return null;
  return { tenantId, clientId };
}

/**
 * Get Google config from env vars.
 * Returns null if GOOGLE_CLIENT_ID not set.
 */
export function getGoogleConfig() {
  const { clientId, clientSecret } = config.auth.google;
  if (!clientId) return null;
  return { clientId, clientSecret };
}

/**
 * Fetch and cache Microsoft JWKS (public keys for JWT verification).
 */
async function ensureMicrosoftJwks() {
  if (_microsoftJwks) return _microsoftJwks;
  const msConfig = getMicrosoftConfig();
  if (!msConfig) throw new Error("Microsoft config not available");
  const response = await fetch(
    `https://login.microsoftonline.com/${msConfig.tenantId}/discovery/v2.0/keys`
  );
  if (!response.ok) throw new Error("Failed to fetch Microsoft JWKS");
  const data = await response.json();
  _microsoftJwks = data;
  return data;
}

/**
 * Decode JWT payload without verification (to read iss claim for provider detection).
 */
export function decodeTokenPayload(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const decoded = JSON.parse(Buffer.from(parts[1], "base64").toString());
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Validate Microsoft Entra ID JWT token.
 * Returns { id: "microsoft:<oid>", email, displayName, provider, providerId }
 * or null if invalid.
 */
export async function validateMicrosoftToken(token) {
  try {
    const msConfig = getMicrosoftConfig();
    if (!msConfig) return null;

    const jwks = await ensureMicrosoftJwks();
    const { payload } = await jwtVerify(token, async (header) => {
      const key = jwks.keys.find((k) => k.kid === header.kid);
      if (!key) throw new Error("Key not found");
      const { createRemoteJWKSet } = await import("jose");
      const jwkSet = createRemoteJWKSet(
        new URL(`https://login.microsoftonline.com/${msConfig.tenantId}/discovery/v2.0/keys`)
      );
      return jwkSet(header);
    });

    return {
      id: `microsoft:${payload.oid}`,
      email: payload.upn || payload.email || "",
      displayName: payload.name || null,
      provider: "microsoft",
      providerId: payload.oid,
    };
  } catch (err) {
    console.error("[authService] Microsoft validation failed:", err.message);
    return null;
  }
}

/**
 * Validate Google ID token using google-auth-library.
 * Returns { id: "google:<sub>", email, displayName, provider, providerId }
 * or null if invalid.
 */
export async function validateGoogleToken(token) {
  try {
    const googleConfig = getGoogleConfig();
    if (!googleConfig) {
      console.log("[validateGoogleToken] No Google config");
      return null;
    }

    console.log("[validateGoogleToken] Verifying ID token with clientId:", googleConfig.clientId);
    const client = new OAuth2Client(googleConfig.clientId);
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: googleConfig.clientId,
    });
    const payload = ticket.getPayload();
    console.log("[validateGoogleToken] Token verified successfully for:", payload.email);

    return {
      id: `google:${payload.sub}`,
      email: payload.email || "",
      displayName: payload.name || null,
      provider: "google",
      providerId: payload.sub,
    };
  } catch (err) {
    console.error("[validateGoogleToken] Google validation failed:", err.message);
    console.error("[validateGoogleToken] Error stack:", err.stack);
    return null;
  }
}

/**
 * Validate token by auto-detecting provider via iss claim.
 * Returns normalized user info or null if invalid.
 */
export async function validateToken(token) {
  if (!token) {
    console.log("[validateToken] No token provided");
    return null;
  }

  const payload = decodeTokenPayload(token);
  if (!payload) {
    console.log("[validateToken] Failed to decode token payload");
    return null;
  }

  const iss = String(payload.iss || "");
  console.log("[validateToken] Detected issuer:", iss);

  // Google issuer
  if (iss.includes("accounts.google.com")) {
    console.log("[validateToken] Calling validateGoogleToken");
    return validateGoogleToken(token);
  }

  // Microsoft issuer
  if (iss.includes("login.microsoftonline.com")) {
    console.log("[validateToken] Calling validateMicrosoftToken");
    return validateMicrosoftToken(token);
  }

  console.log("[validateToken] Unknown issuer, returning null");
  return null;
}

/**
 * Extract Bearer token from HTTP or WebSocket request.
 * HTTP: reads Authorization: Bearer <token> header
 * WS: reads query parameter ?token=<token> or sec-websocket-protocol header
 */
export function extractToken(req) {
  // HTTP Authorization header
  const authHeader = req.get?.("authorization") || req.headers?.authorization;
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1];
  }

  // WebSocket query parameter (e.g., ?token=<token>)
  if (req.url) {
    try {
      const url = new URL(req.url, `http://${req.headers?.host || "localhost"}`);
      const token = url.searchParams.get("token");
      if (token) return token;
    } catch (err) {
      console.log("[extractToken] Error parsing URL:", err.message);
    }
  }

  // WebSocket sec-websocket-protocol header (legacy)
  const protocol = req.headers?.["sec-websocket-protocol"];
  if (protocol) {
    const parts = protocol.split(",").map((p) => p.trim());
    if (parts[0] === "access_token" && parts[1]) return parts[1];
  }

  return null;
}

/**
 * Get combined auth config (Microsoft + Google).
 * Returns { enabled: bool, microsoft: {...}, google: {...} } or null if neither is configured.
 */
export function getAuthConfig() {
  const microsoftConfig = getMicrosoftConfig();
  const googleConfig = getGoogleConfig();

  if (!microsoftConfig && !googleConfig) return null;

  return {
    enabled: true,
    microsoft: microsoftConfig
      ? {
          clientId: microsoftConfig.clientId,
          authority: `https://login.microsoftonline.com/${microsoftConfig.tenantId}`,
        }
      : null,
    google: googleConfig
      ? {
          clientId: googleConfig.clientId,
        }
      : null,
  };
}
