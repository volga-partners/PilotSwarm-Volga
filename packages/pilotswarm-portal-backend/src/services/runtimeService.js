/**
 * Runtime service — wraps PortalRuntime (which wraps NodeSdkTransport from CLI).
 * Lazy singleton: constructs on first call, lazy-starts on first use.
 */

import { NodeSdkTransport } from "../../../cli/src/node-sdk-transport.js";
import { config } from "../config.js";

/**
 * PortalRuntime — thin wrapper around NodeSdkTransport.
 * Handles start/stop, bootstrap, and method dispatch.
 */
class PortalRuntime {
  constructor(opts) {
    this.store = opts.store || "sqlite::memory:";
    this.mode = opts.mode || "local";
    this.transport = null;
    this.started = false;
    this.startPromise = null;
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = (async () => {
      if (this.started) return;
      this.transport = await NodeSdkTransport.create({
        store: this.store,
        mode: this.mode,
        workers: config.workers,
      });
      await this.transport.start();
      this.started = true;
    })();
    return this.startPromise;
  }

  async stop() {
    if (!this.started || !this.transport) return;
    await this.transport.stop().catch(() => {});
    this.started = false;
  }

  async getBootstrap(userId) {
    await this.start();
    return this.transport.getBootstrap(userId);
  }

  async call(method, params, userId) {
    await this.start();
    return this.transport.call(method, params, userId);
  }

  async downloadArtifact(sessionId, filename, userId) {
    await this.start();
    return this.transport.downloadArtifact(sessionId, filename, userId);
  }

  subscribeSession(sessionId, callback) {
    if (!this.transport) throw new Error("Transport not started");
    return this.transport.subscribeSession(sessionId, callback);
  }

  startLogTail(callback) {
    if (!this.transport) throw new Error("Transport not started");
    return this.transport.startLogTail(callback);
  }
}

let _runtime = null;

/**
 * Get or create the singleton PortalRuntime.
 */
export function getRuntimeService() {
  if (!_runtime) {
    _runtime = new PortalRuntime({
      store: config.databaseUrl || "sqlite::memory:",
      mode: config.portalMode,
    });
  }
  return _runtime;
}

/**
 * Stop the runtime and cleanup.
 */
export async function stopRuntimeService() {
  if (_runtime) {
    await _runtime.stop().catch(() => {});
    _runtime = null;
  }
}
