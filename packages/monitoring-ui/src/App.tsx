import { useState } from "react";
import DbThroughput from "./pages/DbThroughput";
import FleetOverview from "./pages/FleetOverview";
import SessionDetail from "./pages/SessionDetail";
import TokenTrends from "./pages/TokenTrends";

type PageId = "fleet" | "tokens" | "db" | "session";

const NAV_ITEMS: Array<{ id: PageId; label: string }> = [
    { id: "fleet",   label: "Fleet Overview" },
    { id: "tokens",  label: "Token Trends"   },
    { id: "db",      label: "DB Throughput"  },
    { id: "session", label: "Session Detail" },
];

const PAGE_META: Record<PageId, { cadence: string }> = {
    fleet:   { cadence: "auto-refresh 60s" },
    tokens:  { cadence: "auto-refresh 60s" },
    db:      { cadence: "auto-refresh 30s" },
    session: { cadence: "auto-refresh 60s when session loaded" },
};

function renderPage(page: PageId) {
    switch (page) {
        case "fleet":   return <FleetOverview />;
        case "tokens":  return <TokenTrends />;
        case "db":      return <DbThroughput />;
        case "session": return <SessionDetail />;
        default:        return null;
    }
}

export default function App() {
    const [page, setPage] = useState<PageId>("fleet");

    return (
        <div className="app-shell">
            <aside className="sidebar">
                <h2 className="brand">PilotSwarm Monitor</h2>
                {NAV_ITEMS.map((item) => (
                    <button
                        key={item.id}
                        className={`nav-button${item.id === page ? " active" : ""}`}
                        type="button"
                        onClick={() => setPage(item.id)}
                    >
                        {item.label}
                    </button>
                ))}
            </aside>

            <main className="main">
                <header className="header">
                    <h1>Monitoring &amp; Observability</h1>
                    <span className="header-note">{PAGE_META[page].cadence}</span>
                </header>
                {renderPage(page)}
            </main>

            <div className="status-bar">
                <span>Page: {NAV_ITEMS.find(n => n.id === page)?.label}</span>
                <span>{PAGE_META[page].cadence}</span>
            </div>
        </div>
    );
}
