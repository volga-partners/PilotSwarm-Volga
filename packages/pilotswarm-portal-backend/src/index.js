/**
 * Entry point — creates server, starts listening, handles graceful shutdown.
 */

// Load .env file first, before any other imports that use process.env
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env");
const result = dotenv.config({ path: envPath });
console.log("[index] dotenv.config() result:", result.parsed ? Object.keys(result.parsed).length + " vars" : "none");
console.log("[index] dotenv path:", envPath);
console.log("[index] GOOGLE_CLIENT_ID from process.env:", process.env.GOOGLE_CLIENT_ID ? "✓" : "✗");

// Static imports that don't depend on config
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import { WebSocketServer } from "ws";

// Dynamic imports for modules that depend on .env
const { createApp } = await import("./app.js");
const { config } = await import("./config.js");
const { getRuntimeService, stopRuntimeService } = await import("./services/runtimeService.js");
const { closeDb } = await import("./services/dbService.js");
const { handleWsConnection } = await import("./websocket/wsHandler.js");

async function startServer() {
  try {
    const app = await createApp();

    // Create HTTP or HTTPS server
    let server;
    let protocol = "http";
    const { certPath, keyPath } = config.tls;

    if (
      certPath &&
      keyPath &&
      fs.existsSync(certPath) &&
      fs.existsSync(keyPath)
    ) {
      server = https.createServer(
        {
          cert: fs.readFileSync(certPath),
          key: fs.readFileSync(keyPath),
        },
        app
      );
      protocol = "https";
    } else {
      server = http.createServer(app);
    }

    // Attach WebSocket server
    const wss = new WebSocketServer({ server, path: "/portal-ws" });
    wss.on("connection", (ws, req) => {
      // Never let async connection errors crash the process.
      handleWsConnection(ws, req).catch((err) => {
        console.error("[ws] Connection handler failed:", err?.message || err);
        try {
          ws.close(1011, "Internal server error");
        } catch {}
      });
    });
    wss.on("error", (err) => {
      console.error("[ws] WebSocket server error:", err?.message || err);
    });

    let isShuttingDown = false;
    let forceExitTimer = null;

    async function withTimeout(task, label, timeoutMs = 4000) {
      try {
        await Promise.race([
          Promise.resolve().then(task),
          new Promise((_, reject) => {
            const t = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
            t.unref?.();
          }),
        ]);
      } catch (err) {
        console.error(`[server] ${label} failed:`, err?.message || err);
      }
    }

    // Graceful shutdown (with a safety fallback so Ctrl+C always exits)
    async function shutdown(signal = "SIGTERM") {
      if (isShuttingDown) {
        console.warn(`[server] Received ${signal} while shutting down — forcing exit`);
        process.exit(1);
      }
      isShuttingDown = true;
      console.log(`[server] ${signal} received. Shutting down...`);

      forceExitTimer = setTimeout(() => {
        console.error("[server] Forced exit: shutdown exceeded timeout");
        process.exit(1);
      }, 5000);
      forceExitTimer.unref?.();

      // Close WebSocket server and connections (do this first)
      try {
        wss.close();
      } catch (err) {
        console.error("[ws] Error closing WebSocket server:", err?.message);
      }
      for (const client of wss.clients) {
        try {
          client.close();
        } catch {}
      }

      // Stop runtime
      await withTimeout(() => stopRuntimeService(), "Stop runtime", 2000);

      // Close database
      await withTimeout(() => closeDb(), "Close database", 2000);

      // Close HTTP server
      await withTimeout(
        () => new Promise((resolve) => {
          server.close(() => {
            console.log("[server] HTTP server closed");
            resolve();
          });
        }),
        "Close HTTP server",
        2000
      );

      if (forceExitTimer) clearTimeout(forceExitTimer);
      console.log("[server] Shutdown complete");
      process.exit(0);
    }

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    // Start listening
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, () => {
        server.off("error", reject);
        resolve();
      });
    });

    console.log(
      `[portal-backend] PilotSwarm API at ${protocol}://localhost:${config.port}`
    );
    console.log(`[portal-backend] Mode: ${config.portalMode}`);

    return server;
  } catch (err) {
    console.error("[portal-backend] Failed to start:", err.message);
    process.exitCode = 1;
  }
}

// Start the server
startServer();
