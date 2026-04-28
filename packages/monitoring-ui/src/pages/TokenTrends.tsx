import { useState, useEffect, useCallback } from "react";
import { getHourlyTokenBuckets } from "../api/monitoring";
import {
    sinceDate, fmtNum, fmtPct, fmtHour,
    enrichBuckets, computeCacheRatio,
    type SincePreset, type EnrichedBucket,
} from "../utils/transforms";

// ─── SVG chart ────────────────────────────────────────────────────

const W = 800, H = 180, PX = 4, PY = 16;

function polylinePoints(values: number[], globalMax: number): string {
    const n = values.length;
    if (n === 0) return "";
    const innerW = W - PX * 2;
    const innerH = H - PY * 2;
    return values.map((v, i) => {
        const x = PX + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
        const y = PY + innerH - (v / globalMax) * innerH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
}

function TokenChart({ buckets }: { buckets: EnrichedBucket[] }) {
    if (buckets.length < 2) {
        return (
            <div className="chart-container">
                <div className="empty" style={{ padding: "20px" }}>
                    Not enough hourly data to render chart (need ≥ 2 buckets).
                </div>
            </div>
        );
    }

    const inputValues = buckets.map(b => b.totalTokensInput);
    const outputValues = buckets.map(b => b.totalTokensOutput);
    const cacheValues = buckets.map(b => b.totalTokensCacheRead);
    const globalMax = Math.max(1, ...inputValues, ...outputValues, ...cacheValues);

    const inputPts  = polylinePoints(inputValues, globalMax);
    const outputPts = polylinePoints(outputValues, globalMax);
    const cachePts  = polylinePoints(cacheValues, globalMax);

    return (
        <div className="chart-container">
            <svg viewBox={`0 0 ${W} ${H}`} className="token-chart" aria-label="Hourly token trends">
                <polyline points={inputPts}  fill="none" stroke="#67b7ff" strokeWidth="2" strokeLinejoin="round" />
                <polyline points={outputPts} fill="none" stroke="#ffd580" strokeWidth="2" strokeLinejoin="round" />
                <polyline points={cachePts}  fill="none" stroke="#4cd471" strokeWidth="2" strokeLinejoin="round" />
            </svg>
            <div className="chart-legend">
                <span><span className="legend-dot" style={{ background: "#67b7ff" }} />Tokens In</span>
                <span><span className="legend-dot" style={{ background: "#ffd580" }} />Tokens Out</span>
                <span><span className="legend-dot" style={{ background: "#4cd471" }} />Cache Read</span>
            </div>
        </div>
    );
}

// ─── Component ────────────────────────────────────────────────────

const PRESETS: SincePreset[] = ["1h", "6h", "24h", "7d"];

export default function TokenTrends() {
    const [buckets, setBuckets]     = useState<EnrichedBucket[]>([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState<string | null>(null);
    const [since, setSince]         = useState<SincePreset>("24h");
    const [agentId, setAgentId]     = useState("");
    const [model, setModel]         = useState("");

    const loadData = useCallback(async () => {
        try {
            setError(null);
            const raw = await getHourlyTokenBuckets(sinceDate(since), {
                agentId: agentId.trim() || undefined,
                model:   model.trim()   || undefined,
            });
            setBuckets(enrichBuckets(raw));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load token buckets");
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

    // Aggregate totals for header stats
    const totalIn    = buckets.reduce((s, b) => s + b.totalTokensInput, 0);
    const totalOut   = buckets.reduce((s, b) => s + b.totalTokensOutput, 0);
    const totalCache = buckets.reduce((s, b) => s + b.totalTokensCacheRead, 0);
    const totalTurns = buckets.reduce((s, b) => s + b.turnCount, 0);
    const overallCacheRatio = computeCacheRatio(totalCache, totalIn);

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

            {/* Summary row */}
            <div className="cards-grid" style={{ marginBottom: "14px" }}>
                <div className="stat-card">
                    <div className="stat-label">Turns</div>
                    <div className="stat-value">{fmtNum(totalTurns)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Tokens In</div>
                    <div className="stat-value">{fmtNum(totalIn)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Tokens Out</div>
                    <div className="stat-value">{fmtNum(totalOut)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Cache Read</div>
                    <div className="stat-value">{fmtNum(totalCache)}</div>
                </div>
                <div className="stat-card">
                    <div className="stat-label">Cache Ratio</div>
                    <div className="stat-value">{fmtPct(overallCacheRatio)}</div>
                </div>
            </div>

            {/* Error banner (poll failure when data is present) */}
            {error && buckets.length > 0 && (
                <div className="warn-banner">
                    <span>Poll error: {error}</span>
                    <button type="button" className="btn btn-sm" onClick={() => { void loadData(); }}>Retry</button>
                </div>
            )}

            {loading ? (
                <div className="loading">Loading hourly token buckets…</div>
            ) : error && buckets.length === 0 ? (
                <div className="error-state">
                    <span>{error}</span>
                    <button type="button" className="btn btn-sm" onClick={() => { setLoading(true); void loadData(); }}>
                        Retry
                    </button>
                </div>
            ) : buckets.length === 0 ? (
                <div className="empty">No token data for the selected window.</div>
            ) : (
                <>
                    <TokenChart buckets={buckets} />

                    <div className="table-scroll">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Hour</th>
                                    <th>Turns</th>
                                    <th>Tokens In</th>
                                    <th>Tokens Out</th>
                                    <th>Cache Read</th>
                                    <th>Cache Ratio</th>
                                </tr>
                            </thead>
                            <tbody>
                                {buckets.map((b, i) => (
                                    <tr key={i}>
                                        <td>{fmtHour(b.hourBucket)}</td>
                                        <td>{fmtNum(b.turnCount)}</td>
                                        <td>{fmtNum(b.totalTokensInput)}</td>
                                        <td>{fmtNum(b.totalTokensOutput)}</td>
                                        <td>{fmtNum(b.totalTokensCacheRead)}</td>
                                        <td>{fmtPct(b.cacheRatio)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
}
