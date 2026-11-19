import { z } from "zod";
import type { Metrics, SupportedRoute, TraceEvent } from "../agents/reasoning.js";

export const requestStatusSchema = z.enum(["in_progress", "succeeded", "failed", "timed_out"]);
export type RequestStatus = z.infer<typeof requestStatusSchema>;

export const requestMetricsSchema = z.object({
    IICalls: z.number().int().nonnegative(),
    latencyMs: z.number().finite().nonnegative(),
    modelUsed: z.string().trim().min(1).optional(),
    promptTokens: z.number().int().nonnegative().nullable().optional(),
    providerCost: z.number().finite().nonnegative().nullable().optional(),
    contextBreakdown: z.record(z.string(), z.unknown()).optional(),
    historyMessages: z.number().int().nonnegative().optional(),
}).passthrough();

export const requestRecordSchema = z.object({
    requestId: z.string().trim().min(1),
    userId: z.string().trim().min(1),
    route: z.enum(["react", "plan-and-execute", "reflect:react"]).nullable(),
    status: requestStatusSchema,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    statusCode: z.number().int().min(100).max(599).nullable(),
    modelUsed: z.string().trim().min(1).nullable(),
    promptTokens: z.number().int().nonnegative().nullable(),
    providerCost: z.number().finite().nonnegative().nullable(),
    latencyMs: z.number().finite().nonnegative().nullable(),
    metrics: requestMetricsSchema.nullable(),
    errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).nullable(),
});
export type RequestRecord = z.infer<typeof requestRecordSchema>;

export const requestTraceEventSchema = z.object({
    sequence: z.number().int().positive(),
    node: z.string().trim().min(1),
    payload: z.record(z.string(), z.unknown()),
    createdAt: z.string().datetime(),
});
export type RequestTraceEvent = z.infer<typeof requestTraceEventSchema>;

export const requestTraceResultSchema = z.object({
    request: requestRecordSchema,
    trace: z.array(requestTraceEventSchema),
});
export type RequestTraceResult = z.infer<typeof requestTraceResultSchema>;

export const requestAnalyticsRecordSchema = z.object({
    requestId: z.string().trim().min(1),
    startedAt: z.string().datetime(),
    status: requestStatusSchema,
    route: z.enum(["react", "plan-and-execute", "reflect:react"]).nullable(),
    modelUsed: z.string().trim().min(1).nullable(),
    promptTokens: z.number().int().nonnegative().nullable(),
    providerCost: z.number().finite().nonnegative().nullable(),
    latencyMs: z.number().finite().nonnegative().nullable(),
});
export type RequestAnalyticsRecord = z.infer<typeof requestAnalyticsRecordSchema>;

export type StartRequestInput = {
    requestId: string;
    userId: string;
    startedAt: string;
};

export type CompleteRequestInput = {
    requestId: string;
    route: SupportedRoute | null;
    status: Exclude<RequestStatus, "in_progress">;
    completedAt: string;
    statusCode: number;
    metrics: Metrics | null;
    errorCode: string | null;
    trace: readonly TraceEvent[];
};

export interface RequestTraceStore {
    startRequest(input: StartRequestInput): void;
    completeRequest(input: CompleteRequestInput): void;
    getRequestWithTrace(requestId: string): RequestTraceResult | null;
    getRequestsInWindow(startsAt: string, evaluatedAt: string): RequestAnalyticsRecord[];
    close(): void;
}
