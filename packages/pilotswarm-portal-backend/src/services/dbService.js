/**
 * Database service — owns ALL database logic.
 * Layer 1: wraps PgSessionCatalogProvider from SDK (existing sessions CRUD)
 * Layer 2: owns pilotswarm_auth schema + users table (user management)
 */

import pg from "pg";
import { PgSessionCatalogProvider } from "../../../sdk/src/cms.ts";
import { config } from "../config.js";

let _cms = null;
let _pool = null;

/**
 * Initialize both CMS (sessions) and user table.
 */
export async function initializeDb() {
  if (!config.databaseUrl) {
    console.warn("[dbService] No DATABASE_URL — database disabled");
    return;
  }

  try {
    // 1. Existing sessions layer
    _cms = await PgSessionCatalogProvider.create(config.databaseUrl);
    await _cms.initialize();
    console.log("[dbService] Initialized sessions CMS");

    // 2. User table — backend-owned
    const parsed = new URL(config.databaseUrl);
    const needsSsl = ["require", "prefer", "verify-ca", "verify-full"]
      .includes(parsed.searchParams.get("sslmode") ?? "");
    parsed.searchParams.delete("sslmode");

    _pool = new pg.Pool({
      connectionString: parsed.toString(),
      max: 3,
      ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
    });

    _pool.on("error", (err) => {
      console.error("[dbService] Pool error (non-fatal):", err.message);
    });

    // Create schema
    await _pool.query("CREATE SCHEMA IF NOT EXISTS pilotswarm_auth");

    // Create users table
    await _pool.query(`
      CREATE TABLE IF NOT EXISTS pilotswarm_auth.users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL,
        display_name  TEXT,
        provider      TEXT NOT NULL,
        provider_id   TEXT NOT NULL,
        default_model TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(provider, provider_id)
      )
    `);

    // Migrations for sessions table
    try {
      await _pool.query(
        "ALTER TABLE copilot_sessions.sessions ADD COLUMN IF NOT EXISTS owner_id TEXT"
      );
    } catch (err) {
      // Table might not exist yet in CMS, will be created by CMS.initialize()
    }

    console.log("[dbService] Initialized users table");
  } catch (err) {
    console.error("[dbService] Initialization failed:", err.message);
    _cms = null;
    _pool = null;
  }
}

/**
 * Get the PgSessionCatalogProvider (sessions CMS).
 * Returns null if not initialized.
 */
export function getCms() {
  return _cms;
}

/**
 * Get the pg Pool for raw queries (user table operations).
 * Returns null if not initialized.
 */
export function getPool() {
  return _pool;
}

/**
 * Upsert a user (auto-provision on first login).
 */
export async function upsertUser({ id, email, displayName, provider, providerId }) {
  if (!_pool) return;
  await _pool.query(
    `INSERT INTO pilotswarm_auth.users (id, email, display_name, provider, provider_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       display_name = EXCLUDED.display_name,
       updated_at = now()`,
    [id, email, displayName ?? null, provider, providerId]
  );
}

/**
 * Get user profile (including defaultModel preference).
 */
export async function getUserProfile(userId) {
  if (!_pool) return null;
  const { rows } = await _pool.query(
    "SELECT * FROM pilotswarm_auth.users WHERE id = $1",
    [userId]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    provider: r.provider,
    providerId: r.provider_id,
    defaultModel: r.default_model,
  };
}

/**
 * Update user's default model preference.
 */
export async function updateUserDefaultModel(userId, model) {
  if (!_pool) return;
  await _pool.query(
    "UPDATE pilotswarm_auth.users SET default_model = $2, updated_at = now() WHERE id = $1",
    [userId, model]
  );
}

/**
 * Close database connections.
 */
export async function closeDb() {
  if (_cms) {
    await _cms.close().catch(() => {});
  }
  if (_pool) {
    await _pool.end().catch(() => {});
  }
}
