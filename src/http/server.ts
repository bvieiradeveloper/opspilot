import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import { createHash } from "node:crypto";
import { z } from "zod";
import { type WarRoomConfig } from "../config.js";
import { strategyRegistry } from "../agents/index.js";
import {
    ModelUnavailableError,
    RequestNotFoundError,
    UnknownConversationError,
    UnknownStrategyError,
} from "../agents/errors.js";
import type { ReasoningStrategy } from "../agents/reasoning.js";
import { handoffTraceEventSchema, supportedRouteSchema } from "../agents/reasoning.js";
import { withReflection, type ReflectionOptions } from "../agents/reflection.js";
import type { ConversationStore } from "../store/conversation-store.js";
import { createConfiguredSqliteConversationStore } from "../store/sqlite-conversation-store.js";
import {
    createConfiguredSqliteRequestTraceStore,
} from "../store/sqlite-request-trace-store.js";
import {
    requestRecordSchema,
    requestTraceEventSchema,
    type RequestTraceStore,
} from "../store/request-trace-store.js";
import {
    createConfiguredSqliteMemoryStore,
    MemoryNotFoundError,
    type MemoryStore,
} from "../memory/memory-store.js";
import { runChat } from "../services/chat-service.js";
import { createLearningReflector, type LearningReflector } from "../services/learning-reflector.js";
import { supportedRoutes } from "../graph/production-graph.js";
import { createModel } from "../agents/model.js";
import { createJsonLineLogger, type OperationalLogger } from "../obs/logger.js";
import { RequestTracingService } from "../services/request-tracing-service.js";
import {
    RequestAnalyticsService,
    requestAnalyticsQuerySchema,
    requestAnalyticsResponseSchema,
} from "../services/request-analytics-service.js";
import {
    createConfiguredSqliteChatIdempotencyStore,
} from "../store/sqlite-chat-idempotency-store.js";
import {
    chatIdempotencyKeySchema,
    type ChatIdempotencyStore,
} from "../store/chat-idempotency-store.js";
import { approvalDecisionSchema, type ApprovalRecord } from "../store/approval-store.js";
import type { IncidentProposal } from "../services/approval-service.js";
import type { ApprovalService } from "../services/approval-service.js";

const DEFAULT_REQUEST_TIMEOUT_MS = 180_000;

const chatRequestSchema = z.object({
    message: z.string().trim().min(1, "A non-empty message is required."),
    userId: z.string().trim().min(1, "A non-empty userId is required.").optional(),
    conversationId: z.string().trim().min(1).optional(),
    strategy: z.string().trim().min(1).optional(),
    reflect: z.boolean().optional().default(false),
});
const legacyChatRequestSchema = chatRequestSchema.extend({
    userId: z.string().trim().min(1, "A non-empty userId is required."),
});

const traceNodeSchema = z.string().trim().min(1);
const traceEventSchema = z.discriminatedUnion("type", [
    handoffTraceEventSchema,
    z.object({ type: z.literal("fallback"), node: traceNodeSchema, from: z.string().trim().min(1), to: z.string().trim().min(1) }),
    z.object({ type: z.literal("route"), node: z.literal("router"), route: supportedRouteSchema, reason: z.string().trim().min(1) }),
    z.object({ type: z.literal("thought"), node: traceNodeSchema, summary: z.string() }),
    z.object({ type: z.literal("plan"), node: traceNodeSchema, steps: z.array(z.string()) }),
    z.object({
        type: z.literal("action"), node: traceNodeSchema,
        tool: z.enum(["list_alerts", "open_incident", "resolve_incident", "list_incidents", "consultar_runbooks", "check_provider_status", "list_user_memories", "remember_user_fact", "forget_preference"]),
        args: z.record(z.string(), z.unknown()),
    }),
    z.object({ type: z.literal("observation"), node: traceNodeSchema, result: z.unknown() }),
    z.object({ type: z.literal("critique"), node: traceNodeSchema, summary: z.string() }),
    z.object({ type: z.literal("summarize"), node: traceNodeSchema, conversationId: z.string().trim().min(1), summary: z.string().trim().min(1), summarizedThroughSequence: z.number().int().positive() }),
    z.object({ type: z.literal("answer"), node: traceNodeSchema, text: z.string() }),
]);

export const chatResponseSchema = z.object({
    requestId: z.string().trim().min(1),
    conversationId: z.string().trim().min(1),
    answer: z.string(),
    trace: z.array(traceEventSchema),
    metrics: z.object({
        IICalls: z.number().int().nonnegative(),
        latencyMs: z.number().finite().nonnegative(),
        modelUsed: z.string().trim().min(1).optional(),
        promptTokens: z.number().int().nonnegative().nullable(),
        providerCost: z.number().finite().nonnegative().nullable().optional(),
        contextBreakdown: z.object({
            request: z.number().int().nonnegative().optional(),
            summary: z.number().int().nonnegative().optional(),
            history: z.number().int().nonnegative().optional(),
            memories: z.number().int().nonnegative().optional(),
            toolResults: z.number().int().nonnegative().optional(),
            reflection: z.number().int().nonnegative().optional(),
        }),
        historyMessages: z.number().int().nonnegative().max(8),
    }),
    approvals: z.array(z.object({
        id: z.string().trim().min(1),
        status: z.literal("pending"),
        tool: z.enum(["open_incident", "resolve_incident"]),
        arguments: z.record(z.string(), z.unknown()),
        description: z.string().trim().min(1),
        createdAt: z.string().datetime(),
    })).optional(),
});
const approvalDecisionResponseSchema = z.object({
    approval: z.object({
        id: z.string().trim().min(1),
        status: z.enum(["executing", "executed", "rejected", "failed"]),
        decision: approvalDecisionSchema,
        result: z.unknown().optional(),
        decidedAt: z.string().datetime(),
        completedAt: z.string().datetime().nullable(),
        errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).optional(),
    }),
});

const requestLookupResponseSchema = z.object({
    request: requestRecordSchema,
    trace: z.array(requestTraceEventSchema),
});

const memoryResponseSchema = z.object({
    memory: z.object({
        id: z.string().trim().min(1),
        fact: z.string().trim().min(1),
        createdAt: z.string().datetime(),
    }),
    created: z.boolean(),
});

export type ChatAppOptions = {
    strategies?: ReadonlyMap<string, ReasoningStrategy>;
    conversationStore?: ConversationStore;
    memoryStore?: MemoryStore;
    learningReflector?: LearningReflector;
    onBackgroundError?: (error: unknown) => void;
    reflectionOptions?: ReflectionOptions;
    requestTimeoutMs?: number;
    modelFactory?: typeof createModel;
    requestTraceStore?: RequestTraceStore;
    logger?: OperationalLogger;
    requestIdFactory?: () => string;
    warRoomConfig?: WarRoomConfig;
    chatIdempotencyStore?: ChatIdempotencyStore;
    clock?: () => Date;
    approvalService?: ApprovalService;
    warRoomStrategiesFactory?: (onProposal: (proposal: IncidentProposal) => void) => ReadonlyMap<string, ReasoningStrategy>;
};

function requestFingerprint(input: {
    message: string;
    conversationId?: string;
    strategy?: string;
    reflect: boolean;
}): string {
    return createHash("sha256").update(JSON.stringify({
        message: input.message,
        conversationId: input.conversationId ?? null,
        strategy: input.strategy ?? null,
        reflect: input.reflect,
    })).digest("hex");
}

function safeRequestError(error: unknown): { statusCode: number; body: Record<string, unknown> } {
    const { statusCode, errorCode } = getRequestErrorDetails(error);
    const messages: Record<string, string> = {
        UNKNOWN_STRATEGY: "The requested strategy is not supported.",
        UNKNOWN_CONVERSATION: "The requested conversation was not found.",
        MODEL_UNAVAILABLE: "All configured models are unavailable. Try again later.",
        MODEL_RATE_LIMITED: "The model provider rate limit was reached. Try again later.",
        INTERNAL_ERROR: "The request could not be completed.",
    };
    return {
        statusCode,
        body: { error: { code: errorCode, message: messages[errorCode] ?? messages.INTERNAL_ERROR } },
    };
}

function approvalResponse(approval: ApprovalRecord) {
    if (!approval.decision || !approval.decidedAt) {
        throw new Error("A pending approval cannot be returned as a confirmed decision.");
    }
    return approvalDecisionResponseSchema.parse({
        approval: {
            id: approval.id,
            status: approval.status,
            decision: approval.decision,
            ...(approval.status === "executed" ? { result: approval.result } : {}),
            decidedAt: approval.decidedAt,
            completedAt: approval.completedAt,
            ...(approval.status === "failed" && approval.errorCode ? { errorCode: approval.errorCode } : {}),
        },
    });
}

function getRequestErrorDetails(error: unknown): { statusCode: number; errorCode: string } {
    if (error instanceof UnknownStrategyError) return { statusCode: 422, errorCode: "UNKNOWN_STRATEGY" };
    if (error instanceof UnknownConversationError) return { statusCode: 404, errorCode: "UNKNOWN_CONVERSATION" };
    if (error instanceof ModelUnavailableError) return { statusCode: 503, errorCode: "MODEL_UNAVAILABLE" };
    if (typeof error === "object" && error !== null && "status" in error && error.status === 429) {
        return { statusCode: 429, errorCode: "MODEL_RATE_LIMITED" };
    }
    return { statusCode: 500, errorCode: "INTERNAL_ERROR" };
}

export function createChatApp(options: ChatAppOptions = {}): Express {
    const app = express();
    const conversationStore = options.conversationStore ?? createConfiguredSqliteConversationStore();
    const memoryStore = options.memoryStore ?? createConfiguredSqliteMemoryStore();
    const requestTraceStore = options.requestTraceStore ?? createConfiguredSqliteRequestTraceStore();
    const requestTracing = new RequestTracingService({
        store: requestTraceStore,
        logger: options.logger ?? createJsonLineLogger(),
        idFactory: options.requestIdFactory,
    });
    const requestAnalytics = new RequestAnalyticsService({ store: requestTraceStore });
    if (options.warRoomConfig) {
        app.use(cors({
            origin: (origin, callback) => {
                callback(null, origin && options.warRoomConfig!.webOrigins.includes(origin) ? origin : false);
            },
            methods: ["POST"],
            allowedHeaders: ["Content-Type", "Idempotency-Key"],
            exposedHeaders: ["Retry-After"],
            credentials: false,
        }));
    }
    app.use(express.json());
    app.get("/states", (request, response, next) => {
        const parsed = requestAnalyticsQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            response.status(400).json({ issues: parsed.error.issues });
            return;
        }
        try {
            response.status(200).json(requestAnalyticsResponseSchema.parse(requestAnalytics.getSummary(parsed.data)));
        } catch (error) {
            next(error);
        }
    });
    const getRequestTrace = (request: express.Request, response: express.Response, next: express.NextFunction) => {
        const parsed = z.object({ id: z.string().trim().min(1) }).safeParse(request.params);
        if (!parsed.success) {
            response.status(400).json({ issues: parsed.error.issues });
            return;
        }
        try {
            const result = requestTracing.getRequestWithTrace(parsed.data.id);
            response.status(200).json(requestLookupResponseSchema.parse(result));
        } catch (error) {
            next(error);
        }
    };
    app.get("/request/:id", getRequestTrace);
    app.post("/chat", async (request, response, next) => {
        const idempotencyKeyHeader = request.get("Idempotency-Key");
        const isWarRoomRequest = idempotencyKeyHeader !== undefined;
        const parsedRequest = (isWarRoomRequest ? chatRequestSchema : legacyChatRequestSchema).safeParse(request.body);
        if (!parsedRequest.success) {
            response.status(400).json({ issues: parsedRequest.error.issues });
            return;
        }

        if (!isWarRoomRequest && parsedRequest.data.strategy === "team") {
            response.status(403).json({
                error: {
                    code: "TEAM_MODE_REQUIRES_WAR_ROOM",
                    message: "Team mode is available only through the approval-aware War Room.",
                },
            });
            return;
        }

        const userId = isWarRoomRequest ? options.warRoomConfig?.userId : parsedRequest.data.userId;
        if (!userId || !userId.trim()) {
            response.status(isWarRoomRequest ? 503 : 400).json({
                error: {
                    code: isWarRoomRequest ? "WAR_ROOM_NOT_CONFIGURED" : "INVALID_REQUEST",
                    message: isWarRoomRequest
                        ? "War Room identity and CORS configuration are not available."
                        : "A non-empty userId is required.",
                },
            });
            return;
        }

        let idempotency: { key: string; fingerprint: string; store: ChatIdempotencyStore } | undefined;
        if (isWarRoomRequest) {
            const parsedKey = chatIdempotencyKeySchema.safeParse(idempotencyKeyHeader);
            if (!parsedKey.success) {
                response.status(400).json({ issues: parsedKey.error.issues });
                return;
            }
            if (!options.warRoomConfig || !options.chatIdempotencyStore) {
                response.status(503).json({
                    error: {
                        code: "WAR_ROOM_NOT_CONFIGURED",
                        message: "War Room identity and retry storage are not available.",
                    },
                });
                return;
            }
            const fingerprint = requestFingerprint(parsedRequest.data);
            idempotency = { key: parsedKey.data, fingerprint, store: options.chatIdempotencyStore };
            const claim = options.chatIdempotencyStore.claim(parsedKey.data, fingerprint, options.clock?.() ?? new Date());
            if (claim.kind === "replay") {
                response.status(claim.responseStatus).json(claim.responseBody);
                return;
            }
            if (claim.kind === "processing" || claim.kind === "mismatch") {
                if (claim.kind === "processing") response.setHeader("Retry-After", "2");
                response.status(409).json({
                    error: {
                        code: claim.kind === "processing" ? "REQUEST_IN_PROGRESS" : "IDEMPOTENCY_KEY_REUSED",
                        message: claim.kind === "processing"
                            ? "The request is still processing. Retry with the same idempotency key."
                            : "The idempotency key was already used with a different request.",
                    },
                });
                return;
            }
        }
        const completeIdempotency = (status: number, body: Record<string, unknown>) => {
            if (idempotency) {
                idempotency.store.complete(
                    idempotency.key,
                    idempotency.fingerprint,
                    status,
                    body,
                    options.clock?.() ?? new Date(),
                );
            }
        };

        const requestId = requestTracing.start(userId);
        response.setHeader("X-Request-id", requestId);
        const proposals: IncidentProposal[] = [];
        const strategies = isWarRoomRequest
            ? options.warRoomStrategiesFactory?.((proposal) => proposals.push(proposal))
                ?? options.strategies
                ?? strategyRegistry
            : options.strategies ?? strategyRegistry;
        const controller = new AbortController();
        let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<{ type: "timeout" }>((resolve) => {
            deadlineTimer = setTimeout(
                () => resolve({ type: "timeout" }),
                options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
            );
        });

        let completed: { type: "timeout" } | { type: "result"; value: Awaited<ReturnType<typeof runChat>> };
        try {
            const strategyName = parsedRequest.data.strategy;
            if (strategyName && !supportedRoutes.includes(strategyName as (typeof supportedRoutes)[number])) {
                throw new UnknownStrategyError(`Unknown strategy: ${strategyName}`);
            }
            const result = Promise.resolve()
                .then(() => runChat({
                    message: parsedRequest.data.message,
                    userId,
                    conversationId: parsedRequest.data.conversationId,
                    strategy: parsedRequest.data.strategy as (typeof supportedRoutes)[number] | undefined,
                    reflect: parsedRequest.data.reflect,
                }, {
                    conversations: conversationStore,
                    memories: memoryStore,
                    strategies,
                    productionGraph: {
                        strategies,
                        modelFactory: options.modelFactory,
                        reflectionOptions: options.reflectionOptions,
                    },
                    signal: controller.signal,
                }))
                .then((value) => ({ type: "result" as const, value }));
            completed = await Promise.race([result, deadline]);
        } catch (error) {
            const { statusCode, errorCode } = getRequestErrorDetails(error);
            requestTracing.fail(requestId, statusCode, errorCode);
            if (idempotency) {
                const safeError = safeRequestError(error);
                completeIdempotency(safeError.statusCode, safeError.body);
                response.status(safeError.statusCode).json(safeError.body);
            } else {
                next(error);
            }
            return;
        } finally {
            if (deadlineTimer) {
                clearTimeout(deadlineTimer);
            }
        }

        if (completed.type === "timeout") {
            controller.abort();
            requestTracing.timeout(requestId);
            const body = {
                error: {
                    code: "REQUEST_TIMEOUT",
                    message: "The request exceeded the processing time limit.",
                },
            };
            completeIdempotency(504, body);
            response.status(504).json(body);
            return;
        }

        const parsedResult = chatResponseSchema.omit({ requestId: true }).safeParse(completed.value);
        if (!parsedResult.success) {
            requestTracing.fail(requestId, 500, "INTERNAL_ERROR");
            const body = {
                error: {
                    code: "INTERNAL_ERROR",
                    message: "The request could not be completed.",
                },
            };
            completeIdempotency(500, body);
            response.status(500).json(body);
            return;
        }

        if (proposals.length > 0 && !options.approvalService) {
            const body = {
                error: {
                    code: "APPROVAL_UNAVAILABLE",
                    message: "The service could not persist the proposed action.",
                },
            };
            requestTracing.fail(requestId, 503, "APPROVAL_UNAVAILABLE");
            completeIdempotency(503, body);
            response.status(503).json(body);
            return;
        }
        let approvalRecords;
        try {
            approvalRecords = proposals.map((proposal) => options.approvalService!.propose({
                requestId,
                conversationId: parsedResult.data.conversationId,
                userId,
                tool: proposal.tool,
                arguments: proposal.arguments,
            }));
        } catch {
            const body = {
                error: {
                    code: "APPROVAL_UNAVAILABLE",
                    message: "The service could not persist the proposed action.",
                },
            };
            requestTracing.fail(requestId, 503, "APPROVAL_UNAVAILABLE");
            completeIdempotency(503, body);
            response.status(503).json(body);
            return;
        }
        const responseBody = chatResponseSchema.parse({
            ...parsedResult.data,
            requestId,
            ...(approvalRecords.length > 0 ? {
                approvals: approvalRecords.map(({ id, status, tool, arguments: args, description, createdAt }) => ({
                    id,
                    status,
                    tool,
                    arguments: args,
                    description,
                    createdAt,
                })),
            } : {}),
        });
        requestTracing.succeed(requestId, responseBody.metrics, responseBody.trace);
        const responseStatus = responseBody.approvals?.length ? 202 : 200;
        completeIdempotency(responseStatus, responseBody);
        response.status(responseStatus).json(responseBody);
        if (options.learningReflector) {
            void options.learningReflector({
                userId,
                message: parsedRequest.data.message,
            }).catch(() => {
                const safeError = new Error("Background memory learning failed.");
                if (!options.onBackgroundError) {
                    console.error(safeError.message);
                    return;
                }
                try {
                    options.onBackgroundError(safeError);
                } catch {
                    console.error("Background memory error reporting failed.");
                }
            });
        }
    });
    app.post("/approvals/:approvalId", (request, response, next) => {
        const path = z.object({ approvalId: z.string().trim().min(1) }).safeParse(request.params);
        const body = z.object({ decision: approvalDecisionSchema }).strict().safeParse(request.body);
        if (!path.success || !body.success) {
            response.status(400).json({
                issues: [...(path.success ? [] : path.error.issues), ...(body.success ? [] : body.error.issues)],
            });
            return;
        }
        if (!options.warRoomConfig || !options.approvalService) {
            response.status(503).json({
                error: {
                    code: "APPROVAL_UNAVAILABLE",
                    message: "Approval processing is not configured.",
                },
            });
            return;
        }
        try {
            const result = options.approvalService.decide(
                path.data.approvalId,
                options.warRoomConfig.userId,
                body.data.decision,
            );
            if (result.kind === "not_found") {
                response.status(404).json({
                    error: { code: "APPROVAL_NOT_FOUND", message: "The requested approval was not found." },
                });
                return;
            }
            if (result.kind === "conflict") {
                response.status(409).json({
                    error: { code: "APPROVAL_CONFLICT", message: "A different decision was already recorded." },
                });
                return;
            }
            const pendingResponse = approvalResponse(result.approval);
            if (result.kind === "executing") {
                response.setHeader("Retry-After", "2");
                response.status(202).json(pendingResponse);
                return;
            }
            response.status(200).json(pendingResponse);
        } catch (error) {
            next(error);
        }
    });
    app.post("/memories", async (request, response) => {
        const parsed = z.object({
            userId: z.string().trim().min(1),
            fact: z.string().trim().min(1),
        }).safeParse(request.body);
        if (!parsed.success) {
            response.status(400).json({ issues: parsed.error.issues });
            return;
        }
        const result = await memoryStore.remember(parsed.data.userId, parsed.data.fact);
        const payload = memoryResponseSchema.parse({
            memory: {
                id: result.memory.id,
                fact: result.memory.fact,
                createdAt: result.memory.createdAt,
            },
            created: result.created,
        });
        response.status(result.created ? 201 : 200).json(payload);
    });
    app.delete("/memories/:memoryId", (request, response, next) => {
        const parsed = z.object({
            memoryId: z.string().trim().min(1),
            userId: z.string().trim().min(1),
        }).safeParse({
            memoryId: request.params.memoryId,
            userId: request.query.userId,
        });
        if (!parsed.success) {
            response.status(400).json({ issues: parsed.error.issues });
            return;
        }
        try {
            memoryStore.forget(parsed.data.userId, parsed.data.memoryId);
            response.status(204).end();
        } catch (error) {
            next(error);
        }
    });
    const errorHandler: ErrorRequestHandler = (error, _request, response, next) => {
        if (response.headersSent) {
            next(error);
            return;
        }

        if (error instanceof UnknownStrategyError) {
            response.status(422).json({
                error: {
                    code: "UNKNOWN_STRATEGY",
                    message: "The requested strategy is not supported.",
                },
            });
            return;
        }

        if (error instanceof UnknownConversationError) {
            response.status(404).json({
                error: {
                    code: "UNKNOWN_CONVERSATION",
                    message: "The requested conversation was not found.",
                },
            });
            return;
        }

        if (error instanceof RequestNotFoundError) {
            response.status(404).json({
                error: {
                    code: "REQUEST_NOT_FOUND",
                    message: "The requested chat request was not found.",
                },
            });
            return;
        }

        if (error instanceof MemoryNotFoundError) {
            response.status(404).json({
                error: {
                    code: "UNKNOWN_MEMORY",
                    message: "The requested memory was not found.",
                },
            });
            return;
        }

        if (error instanceof ModelUnavailableError) {
            response.status(503).json({
                error: {
                    code: "MODEL_UNAVAILABLE",
                    message: "All configured models are unavailable. Try again later.",
                },
            });
            return;
        }

        const errorStatus = typeof error === "object" && error !== null && "status" in error
            ? error.status
            : undefined;
        if (errorStatus === 429) {
            response.status(429).json({
                error: {
                    code: "MODEL_RATE_LIMITED",
                    message: "The model provider rate limit was reached. Try again later.",
                },
            });
            return;
        }

        const errorType = typeof error === "object" && error !== null && "type" in error
            ? error.type
            : undefined;
        if (errorType === "entity.parse.failed") {
            response.status(400).json({
                error: {
                    code: "INVALID_JSON",
                    message: "Request body must contain valid JSON.",
                },
            });
            return;
        }

        response.status(500).json({
            error: {
                code: "INTERNAL_ERROR",
                message: "The request could not be completed.",
            },
        });
    };
    app.use(errorHandler);
    return app;
}

export function startChatServer(options: ChatAppOptions & { port?: number } = {}) {
    if (options.warRoomConfig && (!options.approvalService || !options.warRoomStrategiesFactory)) {
        throw new Error("War Room mode requires approval storage and an approval-aware strategy registry.");
    }
    const port = options.port ?? Number(process.env.PORT ?? 3000);
    const conversationStore = options.conversationStore ?? createConfiguredSqliteConversationStore();
    const memoryStore = options.memoryStore ?? createConfiguredSqliteMemoryStore();
    const requestTraceStore = options.requestTraceStore ?? createConfiguredSqliteRequestTraceStore();
    const chatIdempotencyStore = options.chatIdempotencyStore
        ?? (options.warRoomConfig ? createConfiguredSqliteChatIdempotencyStore() : undefined);
    const server = createChatApp({
        ...options,
        conversationStore,
        memoryStore,
        requestTraceStore,
        chatIdempotencyStore,
        learningReflector: options.learningReflector ?? createLearningReflector(memoryStore),
    }).listen(port);
    if (!options.conversationStore || !options.memoryStore || !options.requestTraceStore) {
        server.on("close", () => {
            if (!options.conversationStore) conversationStore.close();
            if (!options.memoryStore) memoryStore.close();
            if (!options.requestTraceStore) requestTraceStore.close();
            if (!options.chatIdempotencyStore) chatIdempotencyStore?.close();
        });
    }
    return server;
}