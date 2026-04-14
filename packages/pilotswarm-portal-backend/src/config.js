/**
 * Central configuration — reads all env vars in one place.
 * No other file calls process.env directly.
 */

export const config = {
  port: Number(process.env.PORT) || 3001,
  databaseUrl: process.env.DATABASE_URL || null,
  portalMode: process.env.PORTAL_TUI_MODE || process.env.PORTAL_MODE || "local",
  workers: process.env.WORKERS !== undefined ? Number(process.env.WORKERS) : 4,
  auth: {
    entra: {
      tenantId: process.env.ENTRA_TENANT_ID || null,
      clientId: process.env.ENTRA_CLIENT_ID || null,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || null,
    },
  },
  tls: {
    certPath: process.env.TLS_CERT_PATH || null,
    keyPath: process.env.TLS_KEY_PATH || null,
  },
};

// Debug log
console.log("[config] Google Client ID:", config.auth.google.clientId ? "✓ loaded" : "✗ not loaded");
