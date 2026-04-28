interface RpcSuccess<T> {
    ok: true;
    result: T;
}

interface RpcFailure {
    ok: false;
    error?: string;
    message?: string;
}

type RpcEnvelope<T> = RpcSuccess<T> | RpcFailure;

function extractFailureMessage(payload: unknown, fallback: string): string {
    if (!payload || typeof payload !== "object") return fallback;
    const maybe = payload as { error?: unknown; message?: unknown };
    if (typeof maybe.error === "string" && maybe.error.trim()) return maybe.error;
    if (typeof maybe.message === "string" && maybe.message.trim()) return maybe.message;
    return fallback;
}

export async function rpcCall<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch("/api/rpc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ method, params }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(extractFailureMessage(payload, `Request failed (${response.status})`));
    }

    const envelope = payload as RpcEnvelope<T> | null;
    if (!envelope || envelope.ok !== true) {
        throw new Error(extractFailureMessage(payload, "RPC request failed"));
    }

    return envelope.result;
}
