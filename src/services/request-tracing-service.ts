import { randomUUID } from "node:crypto";
import { RequestNotFoundError } from "../agents/errors.js";
import type { Metrics, SupportedRoute, TraceEvent } from "../agents/reasoning.js";
import type { OperationalLogger } from "../obs/logger.js";
import type { RequestTraceStore } from "../store/request-trace-store.js";

export type RequestTracingServiceOptions = {
    store: RequestTraceStore;
    logger: OperationalLogger;
    idFactory?: () => string;
    clock?: () => Date;
};

export class RequestTracingService {
    private readonly store: RequestTraceStore;
    private readonly logger: OperationalLogger;
    private readonly idFactory: () => string;
    private readonly clock: () => Date;
    private readonly startedAt = new Map<string, number>();

    constructor(options: RequestTracingServiceOptions) {
        this.store = options.store;
        this.logger = options.logger;
        this.idFactory = options.idFactory ?? randomUUID;
        this.clock = options.clock ?? (() => new Date());
    }

    start(userId: string): string {
        const requestId = this.idFactory();
        if (!requestId.trim()) throw new Error("Request ID generator returned an empty identifier.");
        const startedAt = this.clock().toISOString();
        this.store.startRequest({ requestId, userId, startedAt });
        this.startedAt.set(requestId, performance.now());
        this.logger.info({ event: "request.started", requestId, outcome: "in_progress" });
        return requestId;
    }

    succeed(requestId: string, metrics: Metrics, trace: readonly TraceEvent[]): void {
        const route = trace.find((event) => event.type === "route")?.route ?? null;
        this.finalize(requestId, route, "succeeded", 200, metrics, null, trace);
    }

    fail(requestId: string, statusCode: number, errorCode: string): void {
        this.finalize(requestId, null, "failed", statusCode, null, errorCode, []);
    }

    timeout(requestId: string): void {
        this.finalize(requestId, null, "timed_out", 504, null, "REQUEST_TIMEOUT", []);
    }

    getRequestWithTrace(requestId: string) {
        const result = this.store.getRequestWithTrace(requestId);
        if (!result) {
            throw new RequestNotFoundError("The requested chat request was not found.");
        }
        return result;
    }

    private finalize(
        requestId: string,
        route: SupportedRoute | null,
        status: "succeeded" | "failed" | "timed_out",
        statusCode: number,
        metrics: Metrics | null,
        errorCode: string | null,
        trace: readonly TraceEvent[],
    ): void {
        const completedAt = this.clock().toISOString();
        this.store.completeRequest({
            requestId,
            route,
            status,
            completedAt,
            statusCode,
            metrics,
            errorCode,
            trace,
        });
        const startedAt = this.startedAt.get(requestId);
        this.startedAt.delete(requestId);
        this.logger.info({
            event: status === "succeeded" ? "request.completed" : `request.${status}`,
            requestId,
            node: status === "succeeded" ? "response" : undefined,
            outcome: status,
            statusCode,
            route: route ?? undefined,
            promptTokens: metrics?.promptTokens ?? null,
            durationMs: startedAt === undefined ? undefined : Math.max(0, performance.now() - startedAt),
        });
    }
}
