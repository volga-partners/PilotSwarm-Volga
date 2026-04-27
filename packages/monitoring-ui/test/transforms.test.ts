import { describe, it, expect } from "vitest";
import {
    fmtNum, fmtMs, fmtPct, sinceDate,
    computeFleetSummary, computeCacheRatio, normalizeValues, enrichBuckets,
} from "../src/utils/transforms";
import type { FleetTurnAnalyticsRow, HourlyTokenBucketRow } from "../src/types";

// ─── Formatters ───────────────────────────────────────────────────

describe("fmtNum", () => {
    it("returns raw string for small numbers", () => {
        expect(fmtNum(0)).toBe("0");
        expect(fmtNum(42)).toBe("42");
        expect(fmtNum(999)).toBe("999");
    });
    it("formats thousands with K suffix", () => {
        expect(fmtNum(1_000)).toBe("1.0K");
        expect(fmtNum(1_500)).toBe("1.5K");
        expect(fmtNum(999_999)).toBe("1000.0K");
    });
    it("formats millions with M suffix", () => {
        expect(fmtNum(1_000_000)).toBe("1.0M");
        expect(fmtNum(2_500_000)).toBe("2.5M");
    });
});

describe("fmtMs", () => {
    it("formats sub-second durations", () => {
        expect(fmtMs(0)).toBe("0ms");
        expect(fmtMs(200)).toBe("200ms");
        expect(fmtMs(999)).toBe("999ms");
    });
    it("formats seconds", () => {
        expect(fmtMs(1_000)).toBe("1.00s");
        expect(fmtMs(1_500)).toBe("1.50s");
    });
    it("formats minutes", () => {
        expect(fmtMs(60_000)).toBe("1.0m");
        expect(fmtMs(90_000)).toBe("1.5m");
    });
});

describe("fmtPct", () => {
    it("formats zero rate", () => {
        expect(fmtPct(0)).toBe("0.0%");
    });
    it("formats fractional rates", () => {
        expect(fmtPct(0.123)).toBe("12.3%");
        expect(fmtPct(0.005)).toBe("0.5%");
    });
    it("formats 100%", () => {
        expect(fmtPct(1)).toBe("100.0%");
    });
});

// ─── sinceDate ────────────────────────────────────────────────────

describe("sinceDate", () => {
    it("returns a date in the past for each preset", () => {
        const now = Date.now();
        for (const preset of ["15m", "1h", "6h", "24h", "7d"] as const) {
            const d = sinceDate(preset);
            expect(d.getTime()).toBeLessThan(now);
        }
    });
    it("1h preset is approximately 3600 seconds ago", () => {
        const d = sinceDate("1h");
        const delta = Date.now() - d.getTime();
        expect(delta).toBeGreaterThanOrEqual(3_598_000);
        expect(delta).toBeLessThanOrEqual(3_602_000);
    });
});

// ─── computeFleetSummary ──────────────────────────────────────────

function makeRow(overrides: Partial<FleetTurnAnalyticsRow> = {}): FleetTurnAnalyticsRow {
    return {
        agentId: null, model: null,
        turnCount: 0, errorCount: 0, toolCallCount: 0, toolErrorCount: 0,
        avgDurationMs: 0, p95DurationMs: 0,
        totalTokensInput: 0, totalTokensOutput: 0,
        totalTokensCacheRead: 0, totalTokensCacheWrite: 0,
        ...overrides,
    };
}

describe("computeFleetSummary", () => {
    it("returns zero summary for empty rows", () => {
        const s = computeFleetSummary([]);
        expect(s.totalTurns).toBe(0);
        expect(s.errorRate).toBe(0);
        expect(s.avgDurationMs).toBe(0);
    });

    it("sums turn counts across rows", () => {
        const rows = [makeRow({ turnCount: 3 }), makeRow({ turnCount: 7 })];
        expect(computeFleetSummary(rows).totalTurns).toBe(10);
    });

    it("computes weighted average duration", () => {
        const rows = [
            makeRow({ turnCount: 2, avgDurationMs: 100 }),
            makeRow({ turnCount: 8, avgDurationMs: 200 }),
        ];
        // (2*100 + 8*200) / 10 = 1800 / 10 = 180
        expect(computeFleetSummary(rows).avgDurationMs).toBe(180);
    });

    it("computes error rate correctly", () => {
        const rows = [makeRow({ turnCount: 10, errorCount: 2 })];
        const s = computeFleetSummary(rows);
        expect(s.totalErrors).toBe(2);
        expect(s.errorRate).toBeCloseTo(0.2);
    });

    it("error rate is 0 when totalTurns is 0", () => {
        expect(computeFleetSummary([makeRow({ turnCount: 0, errorCount: 0 })]).errorRate).toBe(0);
    });

    it("sums token fields", () => {
        const rows = [
            makeRow({ totalTokensInput: 100, totalTokensOutput: 50, totalTokensCacheRead: 30 }),
            makeRow({ totalTokensInput: 200, totalTokensOutput: 80, totalTokensCacheRead: 70 }),
        ];
        const s = computeFleetSummary(rows);
        expect(s.totalTokensInput).toBe(300);
        expect(s.totalTokensOutput).toBe(130);
        expect(s.totalTokensCacheRead).toBe(100);
    });
});

// ─── computeCacheRatio ────────────────────────────────────────────

describe("computeCacheRatio", () => {
    it("returns 0 when all tokens are zero", () => {
        expect(computeCacheRatio(0, 0)).toBe(0);
    });
    it("computes ratio correctly", () => {
        expect(computeCacheRatio(30, 70)).toBeCloseTo(0.3);
    });
    it("returns 1 when only cache reads", () => {
        expect(computeCacheRatio(100, 0)).toBe(1);
    });
});

// ─── normalizeValues ──────────────────────────────────────────────

describe("normalizeValues", () => {
    it("normalizes to [0, 1] range", () => {
        const result = normalizeValues([0, 50, 100]);
        expect(result[0]).toBe(0);
        expect(result[1]).toBe(0.5);
        expect(result[2]).toBe(1);
    });
    it("handles all-zero input without dividing by zero", () => {
        const result = normalizeValues([0, 0, 0]);
        expect(result.every(v => v === 0)).toBe(true);
    });
    it("handles single value", () => {
        expect(normalizeValues([42])).toEqual([1]);
    });
});

// ─── enrichBuckets ────────────────────────────────────────────────

describe("enrichBuckets", () => {
    it("adds cacheRatio to each bucket", () => {
        const buckets: HourlyTokenBucketRow[] = [{
            hourBucket: "2026-04-27T00:00:00.000Z",
            turnCount: 5,
            totalTokensInput: 70, totalTokensOutput: 30,
            totalTokensCacheRead: 30, totalTokensCacheWrite: 0,
        }];
        const result = enrichBuckets(buckets);
        expect(result[0].cacheRatio).toBeCloseTo(0.3);
    });
    it("preserves all original fields", () => {
        const bucket: HourlyTokenBucketRow = {
            hourBucket: "2026-04-27T01:00:00.000Z",
            turnCount: 2,
            totalTokensInput: 100, totalTokensOutput: 40,
            totalTokensCacheRead: 0, totalTokensCacheWrite: 0,
        };
        const result = enrichBuckets([bucket]);
        expect(result[0].turnCount).toBe(2);
        expect(result[0].hourBucket).toBe("2026-04-27T01:00:00.000Z");
        expect(result[0].cacheRatio).toBe(0);
    });
});
