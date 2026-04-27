/** Mirrors sdk TurnMetricRow — Date fields serialized to ISO strings over RPC. */
export interface TurnMetricRow {
    id: number;
    sessionId: string;
    agentId: string | null;
    model: string | null;
    turnIndex: number;
    startedAt: string;
    endedAt: string;
    durationMs: number;
    tokensInput: number;
    tokensOutput: number;
    tokensCacheRead: number;
    tokensCacheWrite: number;
    toolCalls: number;
    toolErrors: number;
    resultType: string | null;
    errorMessage: string | null;
    workerNodeId: string | null;
    createdAt: string;
}

/** Mirrors sdk FleetTurnAnalyticsRow. errorRate is derived in the UI. */
export interface FleetTurnAnalyticsRow {
    agentId: string | null;
    model: string | null;
    turnCount: number;
    errorCount: number;
    toolCallCount: number;
    toolErrorCount: number;
    avgDurationMs: number;
    p95DurationMs: number;
    totalTokensInput: number;
    totalTokensOutput: number;
    totalTokensCacheRead: number;
    totalTokensCacheWrite: number;
}

/** Mirrors sdk HourlyTokenBucketRow — hourBucket is an ISO string over RPC. */
export interface HourlyTokenBucketRow {
    hourBucket: string;
    turnCount: number;
    totalTokensInput: number;
    totalTokensOutput: number;
    totalTokensCacheRead: number;
    totalTokensCacheWrite: number;
}

/** Mirrors sdk FleetDbCallMetricRow. */
export interface FleetDbCallMetricRow {
    method: string;
    calls: number;
    errors: number;
    totalMs: number;
    avgMs: number;
    errorRate: number;
}
