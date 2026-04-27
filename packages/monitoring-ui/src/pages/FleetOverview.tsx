import { useState, useEffect, useCallback } from "react";
import { getFleetTurnAnalytics } from "../api/monitoring";
import type { FleetTurnAnalyticsRow } from "../types";
import {
    sinceDate, fmtNum, fmtMs, fmtPct,
    computeFleetSummary,
    type SincePreset,
} from "../utils/transforms";

// ─── Types ────────────────────────────────────────────────────────

interface EnrichedRow extends FleetTurnAnalyticsRow {
    errorRate: number;
}

type SortKey = keyof Pick<EnrichedRow,
    "agentId" | "model" | "turnCount" | "errorCount" | "errorRate" |
    "avgDurationMs" | "p95DurationMs" | "totalTokensInput" | "totalTokensOutput">;

type SortDir = "asc" | "desc";

const COL_LABELS: Record<SortKey, string> = {
    agentId:         "Agent",
    model:           "Model",
    turnCount:       "Turns",
    errorCount:      "Errors",
    errorRate:       "Error Rate",
    avgDurationMs:   "Avg Dur",
    p95DurationMs:   "p95 Dur",
    totalTokensInput:  "Tok In",
    totalTokensOutput: "Tok Out",
};

const SORT_KEYS: SortKey[] = [
    "agentId", "model", "turnCount", "errorCount", "errorRate",
    "avgDurationMs", "p95DurationMs", "totalTokensInput", "totalTokensOutput",
];

const PRESETS: SincePreset[] = ["1h", "6h", "24h", "7d"];

// ─── Component ────────────────────────────────────────────────────

export default function FleetOverview() {
    const [rows, setRows]           = useState<EnrichedRow[]>([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState<string | null>(null);
    const [since, setSince]         = useState<SincePreset>("6h");
    const [agentId, setAgentId]     = useState("");
    const [model, setModel]         = useState("");
    const [sortKey, setSortKey]     = useState<SortKey>("turnCount");
    const [sortDir, setSortDir]     = useState<SortDir>("desc");

    const loadData = useCallback(async () => {
        try {
            setError(null);
            const raw = await getFleetTurnAnalytics({
                since:   sinceDate(since),
                agentId: agentId.trim() || undefined,
                model:   model.trim()   || undefined,
            });
            setRows(raw.map(r => ({
                ...r,
                errorRate: r.turnCount > 0 ? r.errorCount / r.turnCount : 0,
            })));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load fleet analytics");
        } finally {
            setLoading(false);
        }
    }, [since, agentId, model]);

    useEffect(() => {
        setLoading(true);
        void loadData();
        const id = setInterval(() => { void loadData(); }, 60_000);
        return () => clearInterval(id);
    }, [loadData]);

    // ── Sort ──────────────────────────────────────────────────────

    function toggleSort(key: SortKey) {
        if (key === sortKey) {
            setSortDir(d => d === "asc" ? "desc" : "asc");
        } else {
            setSortKey(key);
            setSortDir("desc");
        }
    }

    const sorted = [...rows].sort((a, b) => {
        const av = String(a[sortKey] ?? "");
        const bv = String(b[sortKey] ?? "");
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
    });

    const summary = computeFleetSummary(rows);

    // ── Render ────────────────────────────────────────────────────

    return (
        <section>
            {/* Controls */}
            <div className="controls">
                <div className="controls-left">
                    <span className="controls-label">Window:</span>
                    {PRESETS.map(p => (
                        <button
                            key={p}
                            type="button"
                            className={`preset-btn${since === p ? " active" : ""}`}
                            onClick={() => setSince(p)}
                        >{p}</button>
                    ))}
                </div>
                <div className="controls-right">
                    <input
                        className="filter-input"
                        placeholder="Agent ID filter…"
                        value={agentId}
                        onChange={e => setAgentId(e.target.value)}
                    />
                    <input
                        className="filter-input"
                        placeholder="Model filter…"
                        value={model}
                        onChange={e => setModel(e.target.value)}
                    />
                </div>
            </div>

            {/* Summary cards — always render even during loading */}
            <div className="cards-grid">
                <div className="stat-card">
                    <div className="stat-label">Total Turns</div>
                    <div className="stat-value">{fmtNum(summary.totalTurns)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Errors</div>
                    <div className="stat-value">
                        {fmtNum(summary.totalErrors)}
                        <span className="stat-sub"> ({fmtPct(summary.errorRate)})</span>
                    </div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Avg Duration</div>
                    <div className="stat-value">{fmtMs(summary.avgDurationMs)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Tokens In</div>
                    <div className="stat-value">{fmtNum(summary.totalTokensInput)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Tokens Out</div>
                    <div className="stat-value">{fmtNum(summary.totalTokensOutput)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Cache Read</div>
                    <div className="stat-value">{fmtNum(summary.totalTokensCacheRead)}</div>
                </div>
            </div>

            {/* Error banner when poll fails but we have data */}
            {error && rows.length > 0 && (
                <div className="warn-banner">
                    <span>Poll error: {error}</span>
                    <button type="button" className="btn btn-sm" onClick={() => { void loadData(); }}>Retry</button>
                </div>
            )}

            {/* Table / states */}
            {loading ? (
                <div className="loading">Loading fleet analytics…</div>
            ) : error && rows.length === 0 ? (
                <div className="error-state">
                    <span>{error}</span>
                    <button type="button" className="btn btn-sm" onClick={() => { setLoading(true); void loadData(); }}>
                        Retry
                    </button>
                </div>
            ) : sorted.length === 0 ? (
                <div className="empty">No fleet analytics for the selected window.</div>
            ) : (
                <div className="table-scroll">
                    <table className="data-table">
                        <thead>
                            <tr>
                                {SORT_KEYS.map(k => (
                                    <th key={k} className="th-sort" onClick={() => toggleSort(k)}>
                                        {COL_LABELS[k]}
                                        {k === sortKey ? (sortDir === "asc" ? " ↑" : " ↓") : " ↕"}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((row, i) => (
                                <tr key={i}>
                                    <td>{row.agentId ?? "—"}</td>
                                    <td>{row.model ?? "—"}</td>
                                    <td>{fmtNum(row.turnCount)}</td>
                                    <td>{fmtNum(row.errorCount)}</td>
                                    <td className={row.errorRate > 0.01 ? "warn-cell" : ""}>
                                        {fmtPct(row.errorRate)}
                                    </td>
                                    <td>{fmtMs(row.avgDurationMs)}</td>
                                    <td>{fmtMs(row.p95DurationMs)}</td>
                                    <td>{fmtNum(row.totalTokensInput)}</td>
                                    <td>{fmtNum(row.totalTokensOutput)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
