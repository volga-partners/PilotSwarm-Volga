import type { FleetTurnAnalyticsRow, HourlyTokenBucketRow } from "../types";

// ─── Time windows ─────────────────────────────────────────────────

export type SincePreset = "1h" | "6h" | "24h" | "7d";
export type DbSincePreset = "15m" | "1h" | "6h" | "24h";

const PRESET_MS: Record<SincePreset | DbSincePreset, number> = {
    "15m": 15 * 60_000,
    "1h":  60 * 60_000,
    "6h":  6 * 60 * 60_000,
    "24h": 24 * 60 * 60_000,
    "7d":  7 * 24 * 60 * 60_000,
};

export function sinceDate(preset: SincePreset | DbSincePreset): Date {
    return new Date(Date.now() - PRESET_MS[preset]);
}

// ─── Formatters ───────────────────────────────────────────────────

export function fmtNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return String(Math.round(n));
}

export function fmtMs(ms: number): string {
    if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
    if (ms >= 1_000)  return `${(ms / 1_000).toFixed(2)}s`;
    return `${Math.round(ms)}ms`;
}

export function fmtPct(rate: number): string {
    return `${(rate * 100).toFixed(1)}%`;
}

export function fmtDate(dateStr: string): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("en-US", {
        month: "short", day: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

export function fmtHour(dateStr: string): string {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "2-digit",
    });
}

// ─── Fleet summary ────────────────────────────────────────────────

export interface FleetSummary {
    totalTurns:           number;
    totalErrors:          number;
    errorRate:            number;
    avgDurationMs:        number;
    totalTokensInput:     number;
    totalTokensOutput:    number;
    totalTokensCacheRead: number;
}

export function computeFleetSummary(rows: FleetTurnAnalyticsRow[]): FleetSummary {
    let totalTurns = 0, totalErrors = 0, weightedDuration = 0;
    let tIn = 0, tOut = 0, tCache = 0;

    for (const r of rows) {
        totalTurns       += r.turnCount;
        totalErrors      += r.errorCount;
        weightedDuration += r.avgDurationMs * r.turnCount;
        tIn    += r.totalTokensInput;
        tOut   += r.totalTokensOutput;
        tCache += r.totalTokensCacheRead;
    }

    return {
        totalTurns,
        totalErrors,
        errorRate:            totalTurns > 0 ? totalErrors / totalTurns : 0,
        avgDurationMs:        totalTurns > 0 ? Math.round(weightedDuration / totalTurns) : 0,
        totalTokensInput:     tIn,
        totalTokensOutput:    tOut,
        totalTokensCacheRead: tCache,
    };
}

// ─── Cache ratio ──────────────────────────────────────────────────

export function computeCacheRatio(cacheRead: number, inputTokens: number): number {
    const total = cacheRead + inputTokens;
    return total > 0 ? cacheRead / total : 0;
}

// ─── SVG chart helpers ────────────────────────────────────────────

export function normalizeValues(values: number[]): number[] {
    const max = Math.max(...values, 1);
    return values.map(v => v / max);
}

// ─── Bucket enrichment ────────────────────────────────────────────

export interface EnrichedBucket extends HourlyTokenBucketRow {
    cacheRatio: number;
}

export function enrichBuckets(buckets: HourlyTokenBucketRow[]): EnrichedBucket[] {
    return buckets.map(b => ({
        ...b,
        cacheRatio: computeCacheRatio(b.totalTokensCacheRead, b.totalTokensInput),
    }));
}
