import { useState, useEffect, useMemo } from "react";
import Sidebar from "./Sidebar";
import Inspector from "./Inspector";
import StatusBar from "./StatusBar";
import PanelDivider from "./PanelDivider";
import ChatView from "../chat/ChatView";
import InputBar from "../chat/InputBar";
import StartupSplash from "../splash/StartupSplash";
import AgentPicker from "../splash/AgentPicker";
import HelpOverlay from "../overlay/HelpOverlay";
import { useKeyboard } from "../../hooks/useKeyboard";
import { usePortal } from "../../hooks/PortalContext";

export default function Shell() {
  const portal = usePortal();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [inspectorWidth, setInspectorWidth] = useState(360);

  useEffect(() => {
    return portal.on("sessionCreated", (data: any) => {
      setActiveSessionId(data.sessionId);
      setShowPicker(false);
    });
  }, [portal]);

  useEffect(() => {
    if (!activeSessionId && portal.sessions.length > 0) {
      setActiveSessionId(portal.sessions[0].id);
    }
  }, [activeSessionId, portal.sessions]);

  useKeyboard({
    onHelp: () => setShowHelp((v) => !v),
  });

  const pickerAgents = useMemo(() => {
    const dynamicAgents = portal.creatableAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      description: agent.description,
      accent: agent.accent,
    }));

    if (portal.allowGeneric) {
      return [
        { id: null, name: "Generic", description: "Open-ended work, any topic", accent: "#888" },
        ...dynamicAgents,
      ];
    }

    return dynamicAgents;
  }, [portal.allowGeneric, portal.creatableAgents]);

  const handleNewSession = () => setShowPicker(true);
  const handlePickAgent = (agentId: string | null) => {
    portal.createSession(agentId).catch((error) => {
      console.error("[portal] createSession failed", error);
    });
  };

  return (
    <div className="flex flex-col h-screen bg-[#1a1a2e] text-gray-200">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-700 bg-[#0d0d1a]">
        <span className="font-bold text-white tracking-wide">● PilotSwarm</span>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <button onClick={() => setShowHelp(true)} title="Help">?</button>
          <span>⚙️</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {activeSessionId ? (
          <>
            <div style={{ width: sidebarWidth, minWidth: 200 }} className="flex-shrink-0 border-r border-gray-700">
              <Sidebar
                activeSessionId={activeSessionId}
                onSelectSession={setActiveSessionId}
                onNewSession={handleNewSession}
              />
            </div>

            <PanelDivider onResize={(delta) => setSidebarWidth((w) => Math.max(200, w + delta))} />

            <div className="flex flex-col flex-1 min-w-0">
              <ChatView sessionId={activeSessionId} />
              <InputBar sessionId={activeSessionId} />
            </div>

            <PanelDivider onResize={(delta) => setInspectorWidth((w) => Math.max(280, w - delta))} />

            <div style={{ width: inspectorWidth, minWidth: 280 }} className="flex-shrink-0 border-l border-gray-700">
              <Inspector sessionId={activeSessionId} />
            </div>
          </>
        ) : (
          <StartupSplash onNewSession={handleNewSession} />
        )}
      </div>

      <StatusBar activeSessionId={activeSessionId} />

      {showPicker && <AgentPicker agents={pickerAgents} onSelect={handlePickAgent} onCancel={() => setShowPicker(false)} />}
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
