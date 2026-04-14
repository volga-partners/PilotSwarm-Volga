import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import { BrowserPortalTransport } from "../browser-transport.js";
import { useAuth } from "./AuthContext";

interface PortalContextValue {
  connected: boolean;
  sessions: SessionInfo[];
  messages: Map<string, ChatMessage[]>;
  thinking: Set<string>;
  creatableAgents: CreatableAgent[];
  allowGeneric: boolean;
  on: (type: string, handler: (data: any) => void) => () => void;
  createSession: (agentId?: string | null, model?: string) => Promise<void>;
  sendMessage: (sessionId: string, text: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
}

export interface SessionInfo {
  id: string;
  title: string;
  status: string;
  agentId?: string;
  parentId?: string;
  isSystem?: boolean;
  model?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  toolCalls?: { name: string; args: string; status: string; result?: string; durationMs?: number }[];
}

export interface CreatableAgent {
  id: string;
  name: string;
  description: string;
  accent: string;
}

interface SessionEvent {
  seq?: number;
  eventType?: string;
  data?: any;
  createdAt?: string | Date;
}

const PortalContext = createContext<PortalContextValue | null>(null);
const AGENT_ACCENTS = ["#ff4444", "#0088ff", "#00ff88", "#ffaa00", "#c084fc", "#22d3ee"];

function toDisplayTitle(agentId: string) {
  return agentId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function stringifyData(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function mapSessionInfo(session: any): SessionInfo {
  return {
    id: String(session?.sessionId || session?.id || ""),
    title: String(session?.title || session?.sessionId || session?.id || "").slice(0, 8) || "Untitled",
    status: String(session?.status || "pending"),
    agentId: typeof session?.agentId === "string" ? session.agentId : undefined,
    parentId: typeof session?.parentSessionId === "string" ? session.parentSessionId : undefined,
    isSystem: Boolean(session?.isSystem),
    model: typeof session?.model === "string" ? session.model : undefined,
  };
}

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal must be used within PortalProvider");
  return ctx;
}

export function PortalProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const transportRef = useRef<BrowserPortalTransport | null>(null);
  const subscriptionsRef = useRef<Map<string, () => void>>(new Map());
  const hydratedRef = useRef<Set<string>>(new Set());
  const lastSeqRef = useRef<Map<string, number>>(new Map());
  const listenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  const [connected, setConnected] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [messages, setMessages] = useState<Map<string, ChatMessage[]>>(new Map());
  const [thinking, setThinking] = useState<Set<string>>(new Set());
  const [creatableAgents, setCreatableAgents] = useState<CreatableAgent[]>([]);
  const [allowGeneric, setAllowGeneric] = useState(true);

  const emit = useCallback((type: string, data: any) => {
    listenersRef.current.get(type)?.forEach((handler) => handler(data));
  }, []);

  const appendMessage = useCallback((sessionId: string, nextMessage: ChatMessage) => {
    setMessages((prev) => {
      const next = new Map(prev);
      const current = [...(next.get(sessionId) || [])];
      const last = current[current.length - 1];
      if (
        last &&
        last.role === nextMessage.role &&
        last.content === nextMessage.content &&
        last.timestamp === nextMessage.timestamp
      ) {
        return prev;
      }
      current.push(nextMessage);
      next.set(sessionId, current);
      return next;
    });
  }, []);

  const upsertToolCall = useCallback((sessionId: string, toolCall: { name: string; args: string; status: string; result?: string; durationMs?: number }, timestamp: string) => {
    setMessages((prev) => {
      const next = new Map(prev);
      const current = [...(next.get(sessionId) || [])];
      let lastAssistant = [...current].reverse().find((message) => message.role === "assistant");
      if (!lastAssistant) {
        lastAssistant = { role: "assistant", content: "", timestamp, toolCalls: [] };
        current.push(lastAssistant);
      }
      if (!lastAssistant.toolCalls) lastAssistant.toolCalls = [];
      const existing = lastAssistant.toolCalls.find((item) => item.name === toolCall.name && item.status === "started");
      if (existing && toolCall.status !== "started") {
        existing.status = toolCall.status;
        existing.result = toolCall.result;
        existing.durationMs = toolCall.durationMs;
      } else if (!existing) {
        lastAssistant.toolCalls.push(toolCall);
      }
      next.set(sessionId, current);
      return next;
    });
  }, []);

  const applySessionEvent = useCallback((sessionId: string, event: SessionEvent) => {
    const seq = typeof event?.seq === "number" ? event.seq : null;
    const lastSeq = lastSeqRef.current.get(sessionId) ?? 0;
    if (seq != null && seq <= lastSeq) return;
    if (seq != null) lastSeqRef.current.set(sessionId, seq);

    const eventType = String(event?.eventType || "");
    const data = event?.data || {};
    const timestamp = event?.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString();

    switch (eventType) {
      case "user.message": {
        appendMessage(sessionId, {
          role: "user",
          content: String(data?.content || data?.prompt || ""),
          timestamp,
        });
        break;
      }
      case "assistant.message": {
        appendMessage(sessionId, {
          role: "assistant",
          content: String(data?.content || ""),
          timestamp,
        });
        setThinking((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
        break;
      }
      case "tool.execution_start": {
        upsertToolCall(sessionId, {
          name: String(data?.toolName || data?.name || "tool"),
          args: stringifyData(data?.args ?? data?.input ?? {}),
          status: "started",
        }, timestamp);
        break;
      }
      case "tool.execution_complete": {
        upsertToolCall(sessionId, {
          name: String(data?.toolName || data?.name || "tool"),
          args: stringifyData(data?.args ?? data?.input ?? {}),
          status: data?.error ? "failed" : "completed",
          result: stringifyData(data?.result ?? data?.output ?? data?.error ?? ""),
          durationMs: typeof data?.durationMs === "number" ? data.durationMs : undefined,
        }, timestamp);
        break;
      }
      case "session.turn_started": {
        setThinking((prev) => {
          const next = new Set(prev);
          next.add(sessionId);
          return next;
        });
        break;
      }
      case "session.turn_completed":
      case "session.idle":
      case "session.wait_started":
      case "session.input_required_started":
      case "session.dehydrated": {
        setThinking((prev) => {
          const next = new Set(prev);
          next.delete(sessionId);
          return next;
        });
        break;
      }
      default:
        break;
    }
  }, [appendMessage, upsertToolCall]);

  const hydrateSession = useCallback(async (sessionId: string, transport?: BrowserPortalTransport | null) => {
    const runtime = transport || transportRef.current;
    if (!runtime || hydratedRef.current.has(sessionId)) return;

    try {
      const events = await runtime.getSessionEvents(sessionId, undefined, 200);
      for (const event of events || []) {
        applySessionEvent(sessionId, event);
      }
      hydratedRef.current.add(sessionId);
    } catch (error) {
      console.error("[portal] failed to hydrate session", sessionId, error);
    }

    if (!subscriptionsRef.current.has(sessionId)) {
      const unsubscribe = runtime.subscribeSession(sessionId, (event: SessionEvent) => {
        applySessionEvent(sessionId, event);
      });
      subscriptionsRef.current.set(sessionId, unsubscribe);
    }
  }, [applySessionEvent]);

  const refreshSessions = useCallback(async () => {
    const transport = transportRef.current;
    if (!transport) return;

    const listedSessions = await transport.listSessions();
    const mapped = (listedSessions || []).map(mapSessionInfo);
    setSessions(mapped);
    for (const session of mapped) {
      hydrateSession(session.id, transport).catch(() => {});
    }
  }, [hydrateSession]);

  useEffect(() => {
    const transport = new BrowserPortalTransport({
      getAccessToken: auth.getAccessToken,
      onUnauthorized: () => {
        auth.logout();
        window.location.href = "/login";
      },
    });
    transportRef.current = transport;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    async function boot() {
      try {
        await transport.start();
        if (cancelled) return;
        setConnected(true);

        const policy = transport.getSessionCreationPolicy() as any;
        setAllowGeneric(policy?.creation?.allowGeneric !== false);

        const agents = await transport.listCreatableAgents().catch(() => []);
        if (!cancelled) {
          setCreatableAgents((agents || []).map((agent: any, index: number) => ({
            id: String(agent?.name || ""),
            name: String(agent?.title || agent?.name || toDisplayTitle(String(agent?.name || "agent"))),
            description: String(agent?.description || "Specialized agent"),
            accent: AGENT_ACCENTS[index % AGENT_ACCENTS.length],
          })));
        }

        await refreshSessions();
        pollTimer = setInterval(() => {
          refreshSessions().catch(() => {});
        }, 4000);
      } catch (error) {
        console.error("[portal] startup failed", error);
        if (!cancelled) setConnected(false);
      }
    }

    boot().catch(() => {});

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      for (const unsubscribe of subscriptionsRef.current.values()) {
        try {
          unsubscribe();
        } catch {}
      }
      subscriptionsRef.current.clear();
      hydratedRef.current.clear();
      lastSeqRef.current.clear();
      transport.stop().catch(() => {});
      transportRef.current = null;
    };
  }, [refreshSessions, auth]);

  const on = useCallback((type: string, handler: (data: any) => void) => {
    if (!listenersRef.current.has(type)) listenersRef.current.set(type, new Set());
    listenersRef.current.get(type)!.add(handler);
    return () => {
      listenersRef.current.get(type)?.delete(handler);
    };
  }, []);

  const createSession = useCallback(async (agentId?: string | null, model?: string) => {
    const transport = transportRef.current;
    if (!transport) return;

    const created = agentId
      ? await transport.createSessionForAgent(agentId, model ? { model } : {})
      : await transport.createSession(model ? { model } : {});

    const sessionId = String(created?.sessionId || "");
    if (!sessionId) return;

    await refreshSessions();
    await hydrateSession(sessionId, transport);
    emit("sessionCreated", { sessionId, agentId: agentId ?? undefined, model: created?.model });
  }, [emit, hydrateSession, refreshSessions]);

  const sendMessage = useCallback(async (sessionId: string, text: string) => {
    const transport = transportRef.current;
    if (!transport) return;

    const prompt = text.trim();
    if (!prompt) return;

    setThinking((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });

    try {
      await transport.sendMessage(sessionId, prompt);
      await refreshSessions();
    } catch (error) {
      console.error("[portal] sendMessage failed", error);
      setThinking((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      throw error;
    }
  }, [refreshSessions]);

  return (
    <PortalContext.Provider
      value={{
        connected,
        sessions,
        messages,
        thinking,
        creatableAgents,
        allowGeneric,
        on,
        createSession,
        sendMessage,
        refreshSessions,
      }}
    >
      {children}
    </PortalContext.Provider>
  );
}
