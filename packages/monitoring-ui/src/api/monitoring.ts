import type {
    FleetDbCallMetricRow,
    FleetTurnAnalyticsRow,
    HourlyTokenBucketRow,
    TurnMetricRow,
} from "../types";
import { rpcCall } from "./rpc";

export async function getSessionTurnMetrics(
    sessionId: string,
    opts?: { since?: Date; limit?: number },
): Promise<TurnMetricRow[]> {
    return rpcCall<TurnMetricRow[]>("getSessionTurnMetrics", {
        sessionId,
        since: opts?.since ? opts.since.toISOString() : undefined,
        limit: opts?.limit,
    });
}

export async function getFleetTurnAnalytics(
    opts?: { since?: Date; agentId?: string; model?: string },
): Promise<FleetTurnAnalyticsRow[]> {
    return rpcCall<FleetTurnAnalyticsRow[]>("getFleetTurnAnalytics", {
        since: opts?.since ? opts.since.toISOString() : undefined,
        agentId: opts?.agentId,
        model: opts?.model,
    });
}

export async function getHourlyTokenBuckets(
    since: Date,
    opts?: { agentId?: string; model?: string },
): Promise<HourlyTokenBucketRow[]> {
    return rpcCall<HourlyTokenBucketRow[]>("getHourlyTokenBuckets", {
        since: since.toISOString(),
        agentId: opts?.agentId,
        model: opts?.model,
    });
}

export async function getFleetDbCallMetrics(
    opts?: { since?: Date },
): Promise<FleetDbCallMetricRow[]> {
    return rpcCall<FleetDbCallMetricRow[]>("getFleetDbCallMetrics", {
        since: opts?.since ? opts.since.toISOString() : undefined,
    });
}

export async function pruneTurnMetrics(olderThan: Date): Promise<number> {
    return rpcCall<number>("pruneTurnMetrics", {
        olderThan: olderThan.toISOString(),
    });
}
