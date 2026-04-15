/**
 * WebSocket connection handler.
 * Handles auth at connection time, then manages subscription messages.
 */

import { extractToken, validateToken, getAuthConfig } from "../services/authService.js";
import { upsertUser } from "../services/dbService.js";
import { getRuntimeService } from "../services/runtimeService.js";

function isSafeThemeId(value) {
  return /^[\w-]+$/u.test(String(value || ""));
}

export async function handleWsConnection(ws, req) {
  console.log("[wsHandler] New WebSocket connection attempt from:", req.url);
  const authConfig = getAuthConfig();
  let userId = null;

  try {
    // Authenticate at connection time (if auth is enabled)
    if (authConfig) {
      console.log("[wsHandler] Auth enabled, extracting token...");
      const token = extractToken(req);
      if (!token) {
        console.log("[wsHandler] No token found, closing connection (401)");
        ws.close(4401, "Unauthorized");
        return;
      }

      console.log("[wsHandler] Token found, validating...");
      const userInfo = await validateToken(token);
      if (!userInfo) {
        console.log("[wsHandler] Token validation failed, closing connection (401)");
        ws.close(4401, "Unauthorized");
        return;
      }

      userId = userInfo.id;
      console.log("[wsHandler] WebSocket authenticated for user:", userId);

      // Auto-provision user
      try {
        await upsertUser({
          id: userInfo.id,
          email: userInfo.email,
          displayName: userInfo.displayName,
          provider: userInfo.provider,
          providerId: userInfo.providerId,
        });
      } catch (err) {
        console.error("[wsHandler] Failed to upsert user:", err.message);
      }
    }

    const runtime = getRuntimeService();
    const sessionSubscriptions = new Map();
    let logUnsubscribe = null;

    const send = (message) => {
      try {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(message));
          console.log("[wsHandler] Sent message:", message.type);
        } else {
          console.warn("[wsHandler] WebSocket not OPEN, cannot send:", message.type, "State:", ws.readyState);
        }
      } catch (err) {
        console.error("[wsHandler] Error sending message:", err.message);
      }
    };

    send({ type: "ready" });

    ws.on("message", async (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return;
      }

      const type = String(message?.type || "");

      // Subscribe to session updates
      if (type === "subscribeSession") {
        const sessionId = String(message?.sessionId || "").trim();
        if (!sessionId || sessionSubscriptions.has(sessionId)) return;

        try {
          await runtime.start();
          const unsubscribe = runtime.subscribeSession(sessionId, (event) => {
            send({ type: "sessionEvent", sessionId, event });
          });
          sessionSubscriptions.set(sessionId, unsubscribe);
          send({ type: "subscribedSession", sessionId });
        } catch (err) {
          send({
            type: "error",
            scope: "session",
            sessionId,
            error: err?.message || String(err),
          });
        }
        return;
      }

      // Unsubscribe from session
      if (type === "unsubscribeSession") {
        const sessionId = String(message?.sessionId || "").trim();
        const unsubscribe = sessionSubscriptions.get(sessionId);
        if (unsubscribe) {
          unsubscribe();
          sessionSubscriptions.delete(sessionId);
        }
        return;
      }

      // Subscribe to logs
      if (type === "subscribeLogs") {
        if (logUnsubscribe) return;

        try {
          await runtime.start();
          logUnsubscribe = runtime.startLogTail((entry) => {
            send({ type: "logEntry", entry });
          });
          send({ type: "subscribedLogs" });
        } catch (err) {
          send({ type: "error", scope: "logs", error: err?.message || String(err) });
        }
        return;
      }

      // Unsubscribe from logs
      if (type === "unsubscribeLogs") {
        if (logUnsubscribe) {
          logUnsubscribe();
          logUnsubscribe = null;
        }
        return;
      }

      // Theme message (safe passthrough)
      if (type === "theme" && isSafeThemeId(message?.themeId)) {
        send({ type: "themeAck", themeId: message.themeId });
      }
    });

    // Cleanup on close
    ws.on("close", () => {
      for (const unsubscribe of sessionSubscriptions.values()) {
        try {
          unsubscribe();
        } catch {}
      }
      sessionSubscriptions.clear();

      if (logUnsubscribe) {
        try {
          logUnsubscribe();
        } catch {}
        logUnsubscribe = null;
      }
    });
  } catch (err) {
    console.error("[wsHandler] Connection setup failed:", err?.message || err);
    try {
      ws.close(1011, "Server error");
    } catch {}
  }
}
