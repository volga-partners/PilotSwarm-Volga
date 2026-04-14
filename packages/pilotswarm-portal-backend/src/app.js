/**
 * Express app factory.
 * Creates and configures the app without binding to a port.
 * Allows testing without starting a server.
 */

import express from "express";
import { initializeDb } from "./services/dbService.js";
import { mountRoutes } from "./routes/index.js";
import { errorHandler } from "./middlewares/errorHandler.js";

export async function createApp() {
  // Initialize database (sessions CMS + user table)
  await initializeDb();

  const app = express();
  app.set("trust proxy", true);

  // CORS middleware — allow frontend to access backend
  app.use((req, res, next) => {
    const origin = req.get("origin");
    // Allow requests from localhost (development) and any origin (you can restrict in production)
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  app.use(express.json({ limit: "1mb" }));

  // Mount all routes
  mountRoutes(app);

  // Error handler must be last
  app.use(errorHandler);

  return app;
}
