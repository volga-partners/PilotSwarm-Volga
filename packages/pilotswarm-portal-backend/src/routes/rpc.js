/**
 * RPC dispatcher route — auth required.
 * Single endpoint dispatches all 27+ RPC methods to their controllers.
 */

import { Router } from "express";
import { requireAuth } from "../middlewares/index.js";
import { validateRpcMethod } from "../validators/rpcValidator.js";

// Import all controllers
import * as sessionCtrl from "../controllers/sessionController.js";
import * as messageCtrl from "../controllers/messageController.js";
import * as modelCtrl from "../controllers/modelController.js";
import * as userCtrl from "../controllers/userController.js";
import * as systemCtrl from "../controllers/systemController.js";
import * as artifactCtrl from "../controllers/artifactController.js";

const router = Router();

// Dispatch table: method name -> controller function
const DISPATCH = {
  // Sessions
  listSessions: sessionCtrl.listSessions,
  createSession: sessionCtrl.createSession,
  createSessionForAgent: sessionCtrl.createSessionForAgent,
  getSession: sessionCtrl.getSession,
  renameSession: sessionCtrl.renameSession,
  deleteSession: sessionCtrl.deleteSession,
  cancelSession: sessionCtrl.cancelSession,
  completeSession: sessionCtrl.completeSession,
  getSessionCreationPolicy: sessionCtrl.getSessionCreationPolicy,
  listCreatableAgents: sessionCtrl.listCreatableAgents,
  getSessionEvents: sessionCtrl.getSessionEvents,
  getSessionEventsBefore: sessionCtrl.getSessionEventsBefore,
  getOrchestrationStats: sessionCtrl.getOrchestrationStats,
  getExecutionHistory: sessionCtrl.getExecutionHistory,

  // Messages
  sendMessage: messageCtrl.sendMessage,
  sendAnswer: messageCtrl.sendAnswer,

  // Models
  listModels: modelCtrl.listModels,
  getModelsByProvider: modelCtrl.getModelsByProvider,
  getDefaultModel: modelCtrl.getDefaultModel,
  updateSessionModel: modelCtrl.updateSessionModel,

  // Users
  getUserProfile: userCtrl.getUserProfile_,
  setUserDefaultModel: userCtrl.setUserDefaultModel,

  // System
  getLogConfig: systemCtrl.getLogConfig,
  getWorkerCount: systemCtrl.getWorkerCount,

  // Artifacts
  listArtifacts: artifactCtrl.listArtifacts,
  downloadArtifact: artifactCtrl.downloadArtifactRpc,
  exportExecutionHistory: artifactCtrl.exportExecutionHistory,
};

router.post("/api/rpc", requireAuth, async (req, res, next) => {
  const method = String(req.body?.method || "").trim();
  if (!method) {
    return res.status(400).json({ ok: false, error: "RPC method is required" });
  }

  // Validate method and params
  const validation = validateRpcMethod(method, req.body?.params || {});
  if (!validation.ok) {
    return res.status(validation.status).json({ ok: false, error: validation.error });
  }

  const handler = DISPATCH[method];
  if (!handler) {
    return res.status(400).json({ ok: false, error: `Unsupported portal RPC method: ${method}` });
  }

  try {
    await handler(req, res);
  } catch (err) {
    next(err);
  }
});

export default router;
