import { Fragment, useState, useEffect, useCallback, useRef } from "react";
import { getSessionTurnMetrics, pruneTurnMetrics } from "../api/monitoring";
import type { TurnMetricRow } from "../types";
import { fmtNum, fmtMs, fmtPct, fmtDate, sinceDate, type SincePreset } from "../utils/transforms";

// ─── Constants ────────────────────────────────────────────────────

const LIMIT_OPTIONS = [25, 50, 100, 200] as const;
type LimitOption = typeof LIMIT_OPTIONS[number];
const SINCE_PRESETS: Array<{ label: string; value: SincePreset | "" }> = [
    { label: "All time", value: "" },
    { label: "1h",       value: "1h"  },
    { label: "6h",       value: "6h"  },
    { label: "24h",      value: "24h" },
    { label: "7d",       value: "7d"  },
];

// ─── Per-session header stats ─────────────────────────────────────

interface SessionStats {
    totalTurns:    number;
    totalErrors:   number;
    errorRate:     number;
    avgDurationMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
}

function computeSessionStats(rows: TurnMetricRow[]): SessionStats {
    if (rows.length === 0) {
        return { totalTurns: 0, totalErrors: 0, errorRate: 0, avgDurationMs: 0, totalTokensIn: 0, totalTokensOut: 0 };
    }
    const errors  = rows.filter(r => r.resultType === "error").length;
    const avgDur  = Math.round(rows.reduce((s, r) => s + r.durationMs, 0) / rows.length);
    const tIn     = rows.reduce((s, r) => s + r.tokensInput, 0);
    const tOut    = rows.reduce((s, r) => s + r.tokensOutput, 0);
    return {
        totalTurns:    rows.length,
        totalErrors:   errors,
        errorRate:     errors / rows.length,
        avgDurationMs: avgDur,
        totalTokensIn: tIn,
        totalTokensOut: tOut,
    };
}

// ─── Prune modal ──────────────────────────────────────────────────

interface PruneModalProps {
    onClose: () => void;
    onPruned: (count: number) => void;
}

function PruneModal({ onClose, onPruned }: PruneModalProps) {
    const [dateValue, setDateValue] = useState("");
    const [busy, setBusy]           = useState(false);
    const [error, setError]         = useState<string | null>(null);

    async function handleConfirm() {
        if (!dateValue) return;
        const d = new Date(dateValue);
        if (isNaN(d.getTime())) { setError("Invalid date"); return; }
        setBusy(true);
        setError(null);
        try {
            const count = await pruneTurnMetrics(d);
            onPruned(count);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Prune failed");
            setBusy(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-box" onClick={e => e.stopPropagation()}>
                <h3>Prune Old Turn Metrics</h3>
                <p>
                    Permanently delete all turn metric rows with <code>startedAt</code> before the specified date.
                    This action cannot be undone.
                </p>
                <input
                    type="datetime-local"
                    className="text-input"
                    style={{ width: "100%" }}
                    value={dateValue}
                    onChange={e => setDateValue(e.target.value)}
                />
                {error && <div className="toast toast-error" style={{ marginTop: "10px" }}>{error}</div>}
                <div className="modal-actions">
                    <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
                    <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => { void handleConfirm(); }}
                        disabled={!dateValue || busy}
                    >
                        {busy ? "Pruning…" : "Confirm Prune"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────

export default function SessionDetail() {
    const [inputId, setInputId]         = useState("");
    const [activeId, setActiveId]       = useState<string | null>(null);
    const [sincePreset, setSincePreset] = useState<SincePreset | "">("");
    const [limit, setLimit]             = useState<LimitOption>(50);
    const [rows, setRows]               = useState<TurnMetricRow[]>([]);
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState<string | null>(null);
    const [expandedRowId, setExpandedRowId] = useState<number | null>(null);
    const [showPrune, setShowPrune]     = useState(false);
    const [pruneMsg, setPruneMsg]       = useState<string | null>(null);
    const intervalRef                   = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadData = useCallback(async (sessionId: string) => {
        try {
            setError(null);
            const since = sincePreset ? sinceDate(sincePreset) : undefined;
            const data  = await getSessionTurnMetrics(sessionId, { since, limit });
            setRows(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load turn metrics");
        } finally {
            setLoading(false);
        }
    }, [sincePreset, limit]);

    // Start / restart polling whenever activeId or loadData changes
    useEffect(() => {
        if (!activeId) return;
        setLoading(true);
        void loadData(activeId);
        intervalRef.current = setInterval(() => { void loadData(activeId); }, 60_000);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [activeId, loadData]);

    function handleSubmit(e: React.SyntheticEvent) {
        e.preventDefault();
        const id = inputId.trim();
        if (!id) return;
        setRows([]);
        setExpandedRowId(null);
        setPruneMsg(null);
        setActiveId(id);
    }

    function handlePruned(count: number) {
        setShowPrune(false);
        setPruneMsg(`Pruned ${count} row${count !== 1 ? "s" : ""}.`);
        if (activeId) void loadData(activeId);
    }

    const stats = computeSessionStats(rows);

    return (
        <section>
            {/* Session ID form */}
            <form className="session-form" onSubmit={handleSubmit}>
                <input
                    className="session-id-input"
                    placeholder="Session ID…"
                    value={inputId}
                    onChange={e => setInputId(e.target.value)}
                    spellCheck={false}
                />
                <select
                    className="select-input"
                    value={sincePreset}
                    onChange={e => setSincePreset(e.target.value as SincePreset | "")}
                >
                    {SINCE_PRESETS.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                </select>
                <select
                    className="select-input"
                    value={limit}
                    onChange={e => setLimit(Number(e.target.value) as LimitOption)}
                >
                    {LIMIT_OPTIONS.map(l => (
                        <option key={l} value={l}>Limit {l}</option>
                    ))}
                </select>
                <button type="submit" className="btn btn-primary">Load</button>
            </form>

            {/* Nothing loaded yet */}
            {!activeId && (
                <div className="empty">Enter a session ID above and click Load.</div>
            )}

            {/* Loading state */}
            {activeId && loading && rows.length === 0 && (
                <div className="loading">Loading turn metrics for {activeId}…</div>
            )}

            {/* Error state (no data) */}
            {activeId && error && rows.length === 0 && (
                <div className="error-state">
                    <span>{error}</span>
                    <button type="button" className="btn btn-sm" onClick={() => { setLoading(true); void loadData(activeId); }}>
                        Retry
                    </button>
                </div>
            )}

            {/* Poll error banner (data already loaded) */}
            {activeId && error && rows.length > 0 && (
                <div className="warn-banner">
                    <span>Poll error: {error}</span>
                    <button type="button" className="btn btn-sm" onClick={() => { void loadData(activeId); }}>Retry</button>
                </div>
            )}

            {/* Stats + table */}
            {activeId && !loading && rows.length === 0 && !error && (
                <div className="empty">No turn metrics found for this session / window.</div>
            )}

            {rows.length > 0 && (
                <>
                    {/* Header stats */}
                    <div className="cards-grid" style={{ marginBottom: "14px" }}>
                        <div className="stat-card">
                            <div className="stat-label">Turns</div>
                            <div className="stat-value">{fmtNum(stats.totalTurns)}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Errors</div>
                            <div className="stat-value">
                                {fmtNum(stats.totalErrors)}
                                <span className="stat-sub"> ({fmtPct(stats.errorRate)})</span>
                            </div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Avg Duration</div>
                            <div className="stat-value">{fmtMs(stats.avgDurationMs)}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Tokens In</div>
                            <div className="stat-value">{fmtNum(stats.totalTokensIn)}</div>
                        </div>
                        <div className="stat-card">
                            <div className="stat-label">Tokens Out</div>
                            <div className="stat-value">{fmtNum(stats.totalTokensOut)}</div>
                        </div>
                    </div>

                    <div className="table-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Started At</th>
                                    <th>Duration</th>
                                    <th>Result</th>
                                    <th>Tok In</th>
                                    <th>Tok Out</th>
                                    <th>Cache</th>
                                    <th>Tools</th>
                                    <th>Errs</th>
                                    <th>Worker</th>
                                    <th />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <Fragment key={row.id}>
                                        <tr
                                            className={row.resultType === "error" ? "warn-row" : ""}
                                        >
                                            <td>{row.turnIndex}</td>
                                            <td>{fmtDate(row.startedAt)}</td>
                                            <td>{fmtMs(row.durationMs)}</td>
                                            <td className={row.resultType === "error" ? "warn-cell" : ""}>
                                                {row.resultType ?? "—"}
                                            </td>
                                            <td>{fmtNum(row.tokensInput)}</td>
                                            <td>{fmtNum(row.tokensOutput)}</td>
                                            <td>{fmtNum(row.tokensCacheRead)}</td>
                                            <td>{row.toolCalls}</td>
                                            <td className={row.toolErrors > 0 ? "warn-cell" : ""}>{row.toolErrors}</td>
                                            <td>{row.workerNodeId ?? "—"}</td>
                                            <td>
                                                {row.errorMessage && (
                                                    <button
                                                        type="button"
                                                        className="expand-btn"
                                                        onClick={() => setExpandedRowId(expandedRowId === row.id ? null : row.id)}
                                                    >
                                                        {expandedRowId === row.id ? "▲" : "▼"}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                        {expandedRowId === row.id && row.errorMessage && (
                                            <tr>
                                                <td colSpan={11} className="error-msg-cell">
                                                    {row.errorMessage}
                                                </td>
                                            </tr>
                                        )}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Prune action */}
                    <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "12px" }}>
                        <button
                            type="button"
                            className="btn btn-sm btn-danger"
                            onClick={() => { setShowPrune(true); setPruneMsg(null); }}
                        >
                            Prune old metrics…
                        </button>
                        {pruneMsg && <span className="toast toast-success">{pruneMsg}</span>}
                    </div>
                </>
            )}

            {showPrune && (
                <PruneModal onClose={() => setShowPrune(false)} onPruned={handlePruned} />
            )}
        </section>
    );
}
