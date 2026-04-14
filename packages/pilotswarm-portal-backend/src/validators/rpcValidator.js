/**
 * RPC method validator — allowlist + param shape checking.
 */

// Methods dispatched entirely through runtimeService.call()
const RUNTIME_METHODS = new Set([
  "listSessions",
  "getSession",
  "getOrchestrationStats",
  "getExecutionHistory",
  "createSession",
  "createSessionForAgent",
  "listCreatableAgents",
  "getSessionCreationPolicy",
  "sendMessage",
  "sendAnswer",
  "renameSession",
  "cancelSession",
  "completeSession",
  "deleteSession",
  "listModels",
  "listArtifacts",
  "downloadArtifact",
  "exportExecutionHistory",
  "getModelsByProvider",
  "getDefaultModel",
  "getSessionEvents",
  "getSessionEventsBefore",
  "getLogConfig",
  "getWorkerCount",
]);

// Methods handled directly by controllers (database operations)
const DB_METHODS = new Set([
  "getUserProfile",
  "setUserDefaultModel",
  "updateSessionModel",
]);

const ALL_METHODS = new Set([...RUNTIME_METHODS, ...DB_METHODS]);

// Per-method required parameter validation
const REQUIRED_PARAMS = {
  getSession: ["sessionId"],
  getOrchestrationStats: ["sessionId"],
  getExecutionHistory: ["sessionId", "executionId"],
  sendMessage: ["sessionId", "prompt"],
  sendAnswer: ["sessionId", "answer"],
  renameSession: ["sessionId", "title"],
  cancelSession: ["sessionId"],
  completeSession: ["sessionId"],
  deleteSession: ["sessionId"],
  listArtifacts: ["sessionId"],
  downloadArtifact: ["sessionId", "filename"],
  exportExecutionHistory: ["sessionId"],
  getSessionEvents: ["sessionId"],
  getSessionEventsBefore: ["sessionId", "beforeSeq"],
  setUserDefaultModel: [], // model can be null
  updateSessionModel: ["sessionId"], // model can be null
};

/**
 * Validate that method is in the allowlist and params are present.
 * Returns { ok: true } or { ok: false, status, error }.
 */
export function validateRpcMethod(method, params = {}) {
  if (!ALL_METHODS.has(method)) {
    return { ok: false, status: 400, error: `Unsupported portal RPC method: ${method}` };
  }

  const required = REQUIRED_PARAMS[method] || [];
  for (const key of required) {
    const val = params[key];
    // Check for undefined, null, or empty string
    if (val === undefined || val === null || (typeof val === "string" && val === "")) {
      return { ok: false, status: 400, error: `Missing required param: ${key}` };
    }
  }

  return { ok: true };
}

export { RUNTIME_METHODS, DB_METHODS };
