import { useMemo } from "react";
import { usePortal } from "./PortalContext";

/**
 * Hook for managing active session state and event subscriptions.
 *
 * Integrates with PortalContext to receive real-time session events
 * (messages, tool calls, status changes, turn completions).
 */
export function useSession(sessionId: string | null) {
  const { messages, thinking } = usePortal();

  const sessionData = useMemo(() => {
    const sessionMessages = sessionId ? messages.get(sessionId) ?? [] : [];
    const isThinking = sessionId ? thinking.has(sessionId) : false;

    // Extract tool calls from messages
    const toolCalls = sessionMessages
      .filter((msg) => msg.toolCalls && msg.toolCalls.length > 0)
      .flatMap((msg) => msg.toolCalls ?? []);

    return {
      messages: sessionMessages,
      isThinking,
      toolCalls,
    };
  }, [sessionId, messages, thinking]);

  return sessionData;
}
