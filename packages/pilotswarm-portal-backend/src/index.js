/**
 * Entry point — creates server, starts listening, handles graceful shutdown.
 */

// Load .env file first, before any other imports that use process.env
import dotenv from "dotenv";
const result = dotenv.config();
console.log("[index] dotenv.config() result:", result.parsed ? Object.keys(result.parsed).length + " vars" : "none");
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
    wss.on("connection", (ws, req) => handleWsConnection(ws, req));

    // Graceful shutdown
    async function shutdown() {
      console.log("[server] Shutting down...");

      // Close WebSocket connections
      for (const client of wss.clients) {
        try {
          client.close();
        } catch {}
      }

      // Stop runtime
      await stopRuntimeService().catch(() => {});

      // Close database
      await closeDb().catch(() => {});

      // Close HTTP server
      server.close();
      process.exit(0);
    }

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

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
