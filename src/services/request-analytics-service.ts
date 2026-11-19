import { z } from "zod";
import {
    requestAnalyticsRecordSchema,
    type RequestAnalyticsRecord,
    type RequestTraceStore,
} from "../store/request-trace-store.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MAX_SINCE_MS = 30 * DAY_MS;
const DURATION_PATTERN = /^[1-9]\d*[mhd]$/;

function durationMilliseconds(value: string): number {
    const unit = value.at(-1);
    const amount = Number(value.slice(0, -1));
    const multiplier = unit === "m" ? MINUTE_MS : unit === "h" ? HOUR_MS : DAY_MS;
    return amount * multiplier;
}

const sinceSchema = z.string()
    .regex(DURATION_PATTERN, "Use a positive integer followed by m, h, or d.")
    .refine((value) => {
        const milliseconds = durationMilliseconds(value);
        return Number.isSafeInteger(milliseconds) && milliseconds <= MAX_SINCE_MS;
    }, "The maximum reporting window is 30d.");

export const requestAnalyticsQuerySchema = z.object({
    since: sinceSchema.optional(),
}).strict();
export type RequestAnalyticsQuery = z.infer<typeof requestAnalyticsQuerySchema>;

const summarySchema = z.object({
    totalRequests: z.number().int().nonnegative(),
    errorRequests: z.number().int().nonnegative(),
    tokens: z.object({
        total: z.number().int().nonnegative(),
        measuredRequests: z.number().int().nonnegative(),
    }),
    cost: z.object({
        currency: z.literal("USD"),
        total: z.number().finite().nonnegative(),
        measuredRequests: z.number().int().nonnegative(),
        unavailableRequests: z.number().int().nonnegative(),
    }),
    latency: z.object({
        sampleCount: z.number().int().nonnegative(),
        p50Ms: z.number().finite().nonnegative().nullable(),
        p95Ms: z.number().finite().nonnegative().nullable(),
    }),
});

export const requestAnalyticsResponseSchema = z.object({
    since: sinceSchema,
    evaluatedAt: z.string().datetime(),
    overall: summarySchema,
    byRoute: z.array(summarySchema.extend({
        route: z.enum(["react", "plan-and-execute", "reflect:react"]).nullable(),
    })),
    byModel: z.array(summarySchema.extend({
        model: z.string().trim().min(1).nullable(),
    })),
});
export type RequestAnalyticsResponse = z.infer<typeof requestAnalyticsResponseSchema>;

export type RequestAnalyticsServiceOptions = {
    store: Pick<RequestTraceStore, "getRequestsInWindow">;
    clock?: () => Date;
};

function percentile(samples: readonly number[], proportion: number): number | null {
    if (samples.length === 0) return null;
    const sorted = [...samples].sort((left, right) => left - right);
    return sorted[Math.ceil(proportion * sorted.length) - 1]!;
}

function summarizeRequests(rows: readonly RequestAnalyticsRecord[]) {
    const tokenValues: number[] = [];
    const latencies: number[] = [];
    let errorRequests = 0;
    let tokensTotal = 0;
    let costTotal = 0;
    let measuredCostRequests = 0;
    let unavailableCostRequests = 0;

    for (const row of rows) {
        if (row.status === "failed" || row.status === "timed_out") errorRequests += 1;
        if (row.promptTokens !== null) {
            tokensTotal += row.promptTokens;
            tokenValues.push(row.promptTokens);
        }
        if (row.modelUsed?.endsWith(":free")) {
            measuredCostRequests += 1;
        } else if (row.providerCost !== null) {
            costTotal += row.providerCost;
            measuredCostRequests += 1;
        } else {
            unavailableCostRequests += 1;
        }
        if (row.latencyMs !== null) latencies.push(row.latencyMs);
    }

    return {
        totalRequests: rows.length,
        errorRequests,
        tokens: { total: tokensTotal, measuredRequests: tokenValues.length },
        cost: {
            currency: "USD" as const,
            total: costTotal,
            measuredRequests: measuredCostRequests,
            unavailableRequests: unavailableCostRequests,
        },
        latency: {
            sampleCount: latencies.length,
            p50Ms: percentile(latencies, 0.5),
            p95Ms: percentile(latencies, 0.95),
        },
    };
}

function summarizeGroups<Key extends string>(
    rows: readonly RequestAnalyticsRecord[],
    getKey: (row: RequestAnalyticsRecord) => Key | null,
    keyName: "route" | "model",
) {
    const groups = new Map<Key | null, RequestAnalyticsRecord[]>();
    for (const row of rows) {
        const key = getKey(row);
        const group = groups.get(key);
        if (group) group.push(row);
        else groups.set(key, [row]);
    }

    return [...groups.entries()]
        .sort(([left], [right]) => left === null ? (right === null ? 0 : 1) : right === null ? -1 : left.localeCompare(right))
        .map(([key, group]) => ({
            [keyName]: key,
            ...summarizeRequests(group),
        }));
}

export class RequestAnalyticsService {
    private readonly store: RequestAnalyticsServiceOptions["store"];
    private readonly clock: () => Date;

    constructor(options: RequestAnalyticsServiceOptions) {
        this.store = options.store;
        this.clock = options.clock ?? (() => new Date());
    }

    getSummary(query: RequestAnalyticsQuery = {}): RequestAnalyticsResponse {
        const parsedQuery = requestAnalyticsQuerySchema.parse(query);
        const since = parsedQuery.since ?? "24h";
        const evaluatedAt = this.clock();
        const evaluatedAtIso = evaluatedAt.toISOString();
        const startsAt = new Date(evaluatedAt.getTime() - durationMilliseconds(since)).toISOString();
        const rows = this.store.getRequestsInWindow(startsAt, evaluatedAtIso)
            .map((row) => requestAnalyticsRecordSchema.parse(row));

        return requestAnalyticsResponseSchema.parse({
            since,
            evaluatedAt: evaluatedAtIso,
            overall: summarizeRequests(rows),
            byRoute: summarizeGroups(rows, (row) => row.route, "route"),
            byModel: summarizeGroups(rows, (row) => row.modelUsed, "model"),
        });
    }
}
