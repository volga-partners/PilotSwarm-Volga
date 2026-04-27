import { useState, useEffect, useCallback } from "react";
import { getFleetDbCallMetrics } from "../api/monitoring";
import type { FleetDbCallMetricRow } from "../types";
import { sinceDate, fmtNum, fmtMs, fmtPct, type DbSincePreset } from "../utils/transforms";

// ─── Thresholds ───────────────────────────────────────────────────

const HIGH_ERROR_RATE = 0.01;  // >1% → warning
const HIGH_AVG_MS     = 100;   // >100ms → warning

type SortKey = keyof Pick<FleetDbCallMetricRow, "method" | "calls" | "errors" | "totalMs" | "avgMs" | "errorRate">;
type SortDir = "asc" | "desc";

const COL_LABELS: Record<SortKey, string> = {
    method:    "Method",
    calls:     "Calls",
    errors:    "Errors",
    errorRate: "Error Rate",
    avgMs:     "Avg Latency",
    totalMs:   "Total Ms",
};

const SORT_KEYS: SortKey[] = ["method", "calls", "errors", "errorRate", "avgMs", "totalMs"];

const PRESETS: DbSincePreset[] = ["15m", "1h", "6h", "24h"];

// ─── Component ────────────────────────────────────────────────────

export default function DbThroughput() {
    const [rows, setRows]               = useState<FleetDbCallMetricRow[]>([]);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [since, setSince]             = useState<DbSincePreset>("1h");
    const [sortKey, setSortKey]         = useState<SortKey>("calls");
    const [sortDir, setSortDir]         = useState<SortDir>("desc");

    const loadData = useCallback(async () => {
        try {
            setError(null);
            const data = await getFleetDbCallMetrics({ since: sinceDate(since) });
            setRows(data);
            setLastUpdated(new Date());
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load DB call metrics");
        } finally {
            setLoading(false);
        }
    }, [since]);

    useEffect(() => {
        setLoading(true);
        void loadData();
        const id = setInterval(() => { void loadData(); }, 30_000);
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

    function rowWarningClass(row: FleetDbCallMetricRow): string {
        if (row.errorRate > HIGH_ERROR_RATE) return "warn-row";
        return "";
    }

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
                {lastUpdated && (
                    <div className="last-updated">
                        Updated {lastUpdated.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </div>
                )}
            </div>

            {/* Error banner (poll failure with existing data) */}
            {error && rows.length > 0 && (
                <div className="warn-banner">
                    <span>Poll error: {error}</span>
                    <button type="button" className="btn btn-sm" onClick={() => { void loadData(); }}>Retry</button>
                </div>
            )}

            {loading ? (
                <div className="loading">Loading DB call metrics…</div>
            ) : error && rows.length === 0 ? (
                <div className="error-state">
                    <span>{error}</span>
                    <button type="button" className="btn btn-sm" onClick={() => { setLoading(true); void loadData(); }}>
                        Retry
                    </button>
                </div>
            ) : sorted.length === 0 ? (
                <div className="empty">No DB call metrics for the selected window.</div>
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
                                <tr key={i} className={rowWarningClass(row)}>
                                    <td>{row.method}</td>
                                    <td>{fmtNum(row.calls)}</td>
                                    <td>{fmtNum(row.errors)}</td>
                                    <td className={row.errorRate > HIGH_ERROR_RATE ? "warn-cell" : ""}>
                                        {fmtPct(row.errorRate)}
                                    </td>
                                    <td className={row.avgMs > HIGH_AVG_MS ? "warn-cell" : ""}>
                                        {fmtMs(row.avgMs)}
                                    </td>
                                    <td>{fmtMs(row.totalMs)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
