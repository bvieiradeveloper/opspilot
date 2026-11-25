import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { chatResponseSchema, createChatApp, type ChatAppOptions } from "./server.js";
import type { ReasoningStrategy } from "../agents/reasoning.js";
import { ModelUnavailableError } from "../agents/errors.js";
import { SqliteConversationStore } from "../store/sqlite-conversation-store.js";
import { SqliteRequestTraceStore } from "../store/sqlite-request-trace-store.js";
import { EMBEDDING_DIMENSIONS } from "../memory/embeddings.js";
import { SqliteMemoryStore, type MemoryStore } from "../memory/memory-store.js";

type ChatTestOptions = Pick<
    ChatAppOptions,
    "reflectionOptions" | "requestTimeoutMs" | "conversationStore" | "memoryStore" | "requestTraceStore" | "learningReflector" | "onBackgroundError"
>;

async function withChatServer(
    strategies: ReadonlyMap<string, ReasoningStrategy>,
    run: (baseUrl: string) => Promise<void>,
    options: ChatTestOptions = {},
): Promise<void> {
    const conversationStore = options.conversationStore ?? new SqliteConversationStore(":memory:");
    const memoryStore = options.memoryStore ?? new SqliteMemoryStore(":memory:", {
        embed: async () => {
            const vector = new Float32Array(EMBEDDING_DIMENSIONS);
            vector[0] = 1;
            return vector;
        },
    });
    const requestTraceStore = options.requestTraceStore ?? new SqliteRequestTraceStore(":memory:");
    const server = createServer(createChatApp({
        strategies,
        ...options,
        conversationStore,
        memoryStore,
        requestTraceStore,
        logger: { info: () => {} },
    }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;

    try {
        await run(`http://127.0.0.1:${address.port}`);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
        if (!options.conversationStore) {
            conversationStore.close();
        }
        if (!options.memoryStore) {
            memoryStore.close();
        }
        if (!options.requestTraceStore) {
            requestTraceStore.close();
        }
    }
}

function createFakeStrategy(
    name: string,
    calls: Array<{ name: string; request: string }>,
): ReasoningStrategy {
    return {
        name,
        async run(input) {
            calls.push({ name, request: input.request });
            const answer = `${name} handled ${input.request}`;
            return {
                answer,
                trace: [{ type: "answer", node: "test", text: answer }],
                metrics: { IICalls: 1, latencyMs: 12 },
            };
        },
    };
}

test("POST /chat defaults to react and returns answer, trace, and metrics", async () => {
    const calls: Array<{ name: string; request: string }> = [];
    const strategies = new Map<string, ReasoningStrategy>([
        ["react", createFakeStrategy("react", calls)],
        ["plan-and-execute", createFakeStrategy("plan-and-execute", calls)],
    ]);

    await withChatServer(strategies, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "List active alerts", userId: "test-user" }),
        });

        assert.equal(response.status, 200);
        const result = await response.json() as {
            requestId: string;
            conversationId: string;
            answer: string;
            trace: Array<{ type: string; text?: string }>;
            metrics: { IICalls: number; latencyMs: number; historyMessages: number };
        };
        assert.match(result.conversationId, /^conversation-/);
        const { conversationId: _conversationId, requestId: _requestId, ...responseBody } = result;
        assert.deepEqual(responseBody, {
            answer: "react handled List active alerts",
            trace: [
                { type: "route", node: "router", route: "react", reason: "Automatic routing was unavailable; defaulted to react." },
                { type: "answer", node: "react", text: "react handled List active alerts" },
            ],
            metrics: { IICalls: 1, latencyMs: 12, promptTokens: null, contextBreakdown: { request: 4 }, historyMessages: 0 },
        });
    });

    assert.deepEqual(calls, [{ name: "react", request: "List active alerts" }]);
});

test("POST /chat invokes an explicitly selected strategy", async () => {
    const calls: Array<{ name: string; request: string }> = [];
    const strategies = new Map<string, ReasoningStrategy>([
        ["react", createFakeStrategy("react", calls)],
        ["plan-and-execute", createFakeStrategy("plan-and-execute", calls)],
    ]);

    await withChatServer(strategies, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "List active alerts", userId: "test-user", strategy: "plan-and-execute" }),
        });

        assert.equal(response.status, 200);
        const result = await response.json() as {
            conversationId: string;
            answer: "plan-and-execute handled List active alerts",
            trace: Array<{ type: string; text?: string }>;
            metrics: { IICalls: number; latencyMs: number; historyMessages: number };
        };
        assert.match(result.conversationId, /^conversation-/);
        assert.deepEqual(result.metrics, { IICalls: 1, latencyMs: 12, promptTokens: null, contextBreakdown: { request: 4 }, historyMessages: 0 });
        assert.equal(result.answer, "plan-and-execute handled List active alerts");
        assert.deepEqual(result.trace, [
            { type: "route", node: "router", route: "plan-and-execute", reason: "Explicit strategy override." },
            { type: "answer", node: "plan-and-execute", text: "plan-and-execute handled List active alerts" },
        ]);
    });

    assert.deepEqual(calls, [{ name: "plan-and-execute", request: "List active alerts" }]);
});

test("POST /chat accepts check_provider_status actions in the returned trace", async () => {
    const strategy: ReasoningStrategy = {
        name: "react",
        async run() {
            return {
                answer: "GitHub reports operational status.",
                trace: [
                    { type: "action", node: "test", tool: "check_provider_status", args: { provider: "github" } },
                    { type: "observation", node: "test", result: "github is none - All systems operational" },
                    { type: "answer", node: "test", text: "GitHub reports operational status." },
                ],
                metrics: { IICalls: 2, latencyMs: 10 },
            };
        },
    };

    await withChatServer(new Map([["react", strategy]]), async (baseUrl) => {
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "Check GitHub provider status", userId: "test-user" }),
        });

        test("POST /chat validates model-used metrics and successful fallback trace events", async () => {
            const strategy: ReasoningStrategy = {
                name: "react",
                async run() {
                    return {
                        answer: "Fallback model handled the request.",
                        trace: [
                            { type: "fallback", node: "react", from: "provider/primary", to: "provider/fallback" },
                            { type: "answer", node: "react", text: "Fallback model handled the request." },
                        ],
                        metrics: { IICalls: 3, latencyMs: 42, modelUsed: "provider/fallback" },
                    };
                },
            };

            await withChatServer(new Map([["react", strategy]]), async (baseUrl) => {
                const response = await fetch(`${baseUrl}/chat`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ message: "Check status", userId: "test-user", strategy: "react" }),
                });
                const result = await response.json() as {
                    metrics: { modelUsed?: string };
                    trace: Array<{ type: string; from?: string; to?: string }>;
                };

                assert.equal(response.status, 200);
                assert.equal(result.metrics.modelUsed, "provider/fallback");
                assert.deepEqual(result.trace[1], {
                    type: "fallback",
                    node: "react",
                    from: "provider/primary",
                    to: "provider/fallback",
                });
            });
        });

        assert.equal(response.status, 200);
        const result = await response.json() as { trace: Array<{ type: string; tool?: string }> };
        assert.equal(result.trace[0]?.type, "route");
        assert.equal(result.trace[1]?.type, "action");
        assert.equal(result.trace[1]?.tool, "check_provider_status");
    });
});

test("POST /chat applies reflection only when requested", async () => {
    const calls: Array<{ name: string; request: string }> = [];
    let criticCalls = 0;
    const strategies = new Map<string, ReasoningStrategy>([
        ["react", createFakeStrategy("react", calls)],
    ]);

    await withChatServer(strategies, async (baseUrl) => {
        for (const reflect of [undefined, false]) {
            const body = reflect === undefined
                ? { message: "List active alerts", userId: "test-user" }
                : { message: "List active alerts", userId: "test-user", reflect };
            const response = await fetch(`${baseUrl}/chat`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            const result = await response.json() as { trace: Array<{ type: string }>; metrics: { IICalls: number } };

            assert.equal(response.status, 200);
            assert.equal(result.trace.some(({ type }) => type === "critique"), false);
            assert.equal(result.metrics.IICalls, 1);
        }

        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "List active alerts", userId: "test-user", reflect: true }),
        });
        const result = await response.json() as { trace: Array<{ type: string }>; metrics: { IICalls: number } };

        assert.equal(response.status, 200);
        assert.equal(result.trace.some(({ type }) => type === "critique"), true);
        assert.equal(result.metrics.IICalls, 2);
    }, {
        reflectionOptions: {
            maxReflections: 1,
            critic: async () => {
                criticCalls += 1;
                return { approved: true, feedback: "Deterministic approval." };
            },
        },
    });

    assert.equal(calls.length, 3);
    assert.equal(criticCalls, 1);
});

test("POST /chat returns Zod issues for an invalid request body", async () => {
    const strategies = new Map<string, ReasoningStrategy>([
        ["react", createFakeStrategy("react", [])],
    ]);

    await withChatServer(strategies, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "   " }),
        });
        const result = await response.json() as { issues?: Array<{ path: unknown[] }> };

        assert.equal(response.status, 400);
        assert.equal(result.issues?.some(({ path }) => path[0] === "message"), true);
    });
});

test("POST /chat rejects a missing or blank userId before running the strategy", async () => {
    let strategyCalls = 0;
    let memoryLookups = 0;
    const memoryStore: MemoryStore = {
        async remember() { throw new Error("Not expected."); },
        async recall() { memoryLookups += 1; return []; },
        list() { return []; },
        forget() { throw new Error("Not expected."); },
        close() {},
    };
    const strategy: ReasoningStrategy = {
        name: "react",
        async run() {
            strategyCalls += 1;
            return { answer: "unexpected", trace: [{ type: "answer", node: "test", text: "unexpected" }], metrics: { IICalls: 0, latencyMs: 0 } };
        },
    };

    await withChatServer(new Map([["react", strategy]]), async (baseUrl) => {
        for (const body of [{ message: "Check alerts" }, { message: "Check alerts", userId: " " }]) {
            const response = await fetch(`${baseUrl}/chat`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(body),
            });
            assert.equal(response.status, 400);
        }
    }, { memoryStore });
    assert.equal(strategyCalls, 0);
    assert.equal(memoryLookups, 0);
});

test("POST /memories creates and deduplicates user-scoped memories", async () => {
    await withChatServer(new Map(), async (baseUrl) => {
        const create = (fact: string) => fetch(`${baseUrl}/memories`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ userId: "user-a", fact }),
        });

        test("POST /memories rejects missing user IDs and blank facts", async () => {
            await withChatServer(new Map(), async (baseUrl) => {
                for (const body of [{ fact: "A fact." }, { userId: "user-a", fact: " " }]) {
                    const response = await fetch(`${baseUrl}/memories`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(body),
                    });
                    assert.equal(response.status, 400);
                    assert.equal(Array.isArray((await response.json() as { issues?: unknown[] }).issues), true);
                }
            });
        });

        const first = await create("Prefers critical alerts first.");
        const firstBody = await first.json() as { memory: { id: string }; created: boolean };
        assert.equal(first.status, 201);
        assert.equal(firstBody.created, true);

        const duplicate = await create("Same embedding, equivalent fact.");
        const duplicateBody = await duplicate.json() as { memory: { id: string }; created: boolean };
        assert.equal(duplicate.status, 200);
        assert.equal(duplicateBody.created, false);
        assert.equal(duplicateBody.memory.id, firstBody.memory.id);
    });
});

test("POST /chat supplies only memories owned by the request user", async () => {
    const seen: string[] = [];
    const memoryStore = new SqliteMemoryStore(":memory:", {
        embed: async () => {
            const vector = new Float32Array(EMBEDDING_DIMENSIONS);
            vector[0] = 1;
            return vector;
        },
    });
    await memoryStore.remember("user-a", "User A private preference.");
    await memoryStore.remember("user-b", "User B private preference.");
    const strategy: ReasoningStrategy = {
        name: "react",
        async run(input) {
            seen.push(...(input.memories ?? []).map(({ fact }) => fact));
            return { answer: "ok", trace: [{ type: "answer", node: "test", text: "ok" }], metrics: { IICalls: 0, latencyMs: 0 } };
        },
    };

    try {
        await withChatServer(new Map([["react", strategy]]), async (baseUrl) => {
            const response = await fetch(`${baseUrl}/chat`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: "What is my preference?", userId: "user-a" }),
            });
            assert.equal(response.status, 200);
        }, { memoryStore });
    } finally {
        memoryStore.close();
    }

    assert.deepEqual(seen, ["User A private preference."]);
});

test("DELETE /memories hides foreign ownership and deletes an owned memory", async () => {
    await withChatServer(new Map(), async (baseUrl) => {
        const created = await fetch(`${baseUrl}/memories`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ userId: "user-a", fact: "Remember this." }),
        });
        const body = await created.json() as { memory: { id: string } };

        const foreign = await fetch(`${baseUrl}/memories/${body.memory.id}?userId=user-b`, { method: "DELETE" });
        assert.equal(foreign.status, 404);
        assert.deepEqual(await foreign.json(), { error: { code: "UNKNOWN_MEMORY", message: "The requested memory was not found." } });

        const deleted = await fetch(`${baseUrl}/memories/${body.memory.id}?userId=user-a`, { method: "DELETE" });
        assert.equal(deleted.status, 204);
        assert.equal(await deleted.text(), "");
    });
});

test("POST /chat returns without awaiting asynchronous memory learning", async () => {
    let finishLearning: (() => void) | undefined;
    let learnedUserId = "";
    let learnedMessage = "";
    const pendingLearning = new Promise<void>((resolve) => {
        finishLearning = resolve;
    });
    const learningReflector = async (turn: { userId: string; message: string }) => {
        learnedUserId = turn.userId;
        learnedMessage = turn.message;
        await pendingLearning;
    };
    const strategy = createFakeStrategy("react", []);

    await withChatServer(new Map([["react", strategy]]), async (baseUrl) => {
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "I prefer critical alerts first.", userId: "user-a" }),
        });
        assert.equal(response.status, 200);
        assert.equal(learnedUserId, "user-a");
        assert.equal(learnedMessage, "I prefer critical alerts first.");
        finishLearning?.();
    }, { learningReflector });
});

test("POST /chat reports asynchronous learning failures without changing its response", async () => {
    let report: unknown;
    const strategy = createFakeStrategy("react", []);

    await withChatServer(new Map([["react", strategy]]), async (baseUrl) => {
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "I prefer alerts first.", userId: "user-a" }),
        });
        assert.equal(response.status, 200);
        await new Promise<void>((resolve) => setImmediate(resolve));
        assert.match(String(report), /learning failed/);
    }, {
        learningReflector: async () => {
            throw new Error("learning failed: API key is secret-value");
        },
        onBackgroundError: (error) => {
            report = error;
        },
    });
    assert.equal(String(report), "Error: Background memory learning failed.");
    assert.doesNotMatch(String(report), /secret-value|API key/i);
});

test("POST /chat returns a JSON client error for malformed JSON", async () => {
    const strategies = new Map<string, ReasoningStrategy>([
        ["react", createFakeStrategy("react", [])],
    ]);

    await withChatServer(strategies, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{\"message\":",
        });

        assert.equal(response.status, 400);
        assert.match(response.headers.get("content-type") ?? "", /application\/json/);
        assert.equal(typeof await response.json(), "object");
    });
});

test("POST /chat returns a safe JSON error for an unexpected strategy failure", async () => {
    const brokenStrategy: ReasoningStrategy = {
        name: "react",
        async run() {
            throw new Error("internal provider detail");
        },
    };

    await withChatServer(new Map([["react", brokenStrategy]]), async (baseUrl) => {
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "Check status", userId: "test-user", strategy: "react" }),
        });
        const responseText = await response.text();

        assert.equal(response.status, 500);
        assert.match(response.headers.get("content-type") ?? "", /application\/json/);
        assert.equal(responseText.includes("internal provider detail"), false);
        assert.equal(JSON.parse(responseText).error.code, "INTERNAL_ERROR");
    });
});

test("POST /chat maps provider rate limits to a safe 429 response", async () => {
    const rateLimitedStrategy: ReasoningStrategy = {
        name: "react",
        async run() {
            throw Object.assign(new Error("provider quota detail"), { status: 429 });
        },
    };

    await withChatServer(new Map([["react", rateLimitedStrategy]]), async (baseUrl) => {
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "Check status", userId: "test-user", strategy: "react" }),
        });

        test("POST /chat maps exhausted model candidates to a safe 503 response", async () => {
            const unavailableStrategy: ReasoningStrategy = {
                name: "react",
                async run() {
                    throw new ModelUnavailableError();
                },
            };

            await withChatServer(new Map([["react", unavailableStrategy]]), async (baseUrl) => {
                const response = await fetch(`${baseUrl}/chat`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ message: "Check status", userId: "test-user", strategy: "react" }),
                });
                const body = await response.text();

                assert.equal(response.status, 503);
                assert.equal(body.includes("provider"), false);
                assert.deepEqual(JSON.parse(body), {
                    error: {
                        code: "MODEL_UNAVAILABLE",
                        message: "All configured models are unavailable. Try again later.",
                    },
                });
            });
        });
        const responseText = await response.text();

        assert.equal(response.status, 429);
        assert.match(response.headers.get("content-type") ?? "", /application\/json/);
        assert.equal(responseText.includes("provider quota detail"), false);
        assert.equal(JSON.parse(responseText).error.code, "MODEL_RATE_LIMITED");
    });
});

test("POST /chat rejects an unknown strategy with 422", async () => {
    const strategies = new Map<string, ReasoningStrategy>([
        ["react", createFakeStrategy("react", [])],
    ]);

    await withChatServer(strategies, async (baseUrl) => {
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "Check status", userId: "test-user", strategy: "missing" }),
        });

        test("legacy POST /chat rejects team mode before invoking an unguarded strategy", async () => {
            const calls: string[] = [];
            const team = {
                name: "team",
                async run() {
                    calls.push("team");
                    return { answer: "unsafe", trace: [], metrics: { IICalls: 1, latencyMs: 1 } };
                },
            };
            await withChatServer(new Map([["team", team]]), async (baseUrl) => {
                const response = await fetch(`${baseUrl}/chat`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ message: "Open an incident", userId: "test-user", strategy: "team" }),
                });
                assert.equal(response.status, 403);
                assert.equal((await response.json() as { error: { code: string } }).error.code, "TEAM_MODE_REQUIRES_WAR_ROOM");
                assert.deepEqual(calls, []);
            });
        });
        const result = await response.json() as { error: { code: string } };

        assert.equal(response.status, 422);
        assert.equal(result.error.code, "UNKNOWN_STRATEGY");
    });
});

test("POST /chat aborts a strategy and returns 504 at the configured deadline", async () => {
    let signalWasAborted = false;
    const slowStrategy: ReasoningStrategy = {
        name: "react",
        async run(input) {
            return await new Promise((resolve) => {
                const fallback = setTimeout(() => resolve({
                    answer: "completed late",
                    trace: [{ type: "answer" as const, node: "react", text: "completed late" }],
                    metrics: { IICalls: 0, latencyMs: 100 },
                }), 100);
                input.signal?.addEventListener("abort", () => {
                    signalWasAborted = true;
                    clearTimeout(fallback);
                    resolve({
                        answer: "aborted",
                        trace: [{ type: "answer" as const, node: "react", text: "aborted" }],
                        metrics: { IICalls: 0, latencyMs: 5 },
                    });
                }, { once: true });
            });
        },
    };

    await withChatServer(new Map([["react", slowStrategy]]), async (baseUrl) => {
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "Wait", userId: "test-user", strategy: "react" }),
        });
        const result = await response.json() as { error: { code: string } };

        assert.equal(response.status, 504);
        assert.equal(result.error.code, "REQUEST_TIMEOUT");
    }, { requestTimeoutMs: 10 });

    assert.equal(signalWasAborted, true);
});

test("POST /chat resumes a conversation with the latest 8 messages in order", async () => {
    const conversationStore = new SqliteConversationStore(":memory:");
    const conversationId = conversationStore.create();
    for (let index = 0; index < 14; index += 1) {
        conversationStore.append(conversationId, index % 2 === 0 ? "user" : "assistant", `history-${index}`);
    }
    let receivedHistory: readonly { role: string; content: string }[] = [];
    const strategy: ReasoningStrategy = {
        name: "react",
        async run(input) {
            receivedHistory = input.history ?? [];
            return {
                answer: "continued",
                trace: [{ type: "answer", node: "test", text: "continued" }],
                metrics: { IICalls: 1, latencyMs: 2 },
            };
        },
    };

    try {
        await withChatServer(new Map([["react", strategy]]), async (baseUrl) => {
            const response = await fetch(`${baseUrl}/chat`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: "current", userId: "test-user", conversationId }),
            });
            const result = await response.json() as {
                conversationId: string;
                metrics: { historyMessages: number };
            };

            assert.equal(response.status, 200);
            assert.equal(result.conversationId, conversationId);
            assert.equal(result.metrics.historyMessages, 8);
        }, { conversationStore });
    } finally {
        conversationStore.close();
    }

    assert.deepEqual(receivedHistory.map(({ content }) => content), Array.from(
        { length: 8 },
        (_, index) => `history-${index + 6}`,
    ));
});

test("POST /chat creates a conversation when the ID is omitted and can resume it", async () => {
    const conversationStore = new SqliteConversationStore(":memory:");
    const calls: Array<{ request: string; history: readonly { role: string; content: string }[] }> = [];
    const strategy: ReasoningStrategy = {
        name: "react",
        async run(input) {
            calls.push({ request: input.request, history: input.history ?? [] });
            return {
                answer: `answer-${calls.length}`,
                trace: [{ type: "answer", node: "test", text: `answer-${calls.length}` }],
                metrics: { IICalls: 0, latencyMs: 1 },
            };
        },
    };

    try {
        await withChatServer(new Map([["react", strategy]]), async (baseUrl) => {
            const firstResponse = await fetch(`${baseUrl}/chat`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: "first message", userId: "test-user" }),
            });
            const first = await firstResponse.json() as {
                conversationId: string;
                metrics: { historyMessages: number };
            };
            assert.equal(firstResponse.status, 200);
            assert.match(first.conversationId, /^conversation-/);
            assert.equal(first.metrics.historyMessages, 0);

            const secondResponse = await fetch(`${baseUrl}/chat`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: "second message", userId: "test-user", conversationId: first.conversationId }),
            });
            const second = await secondResponse.json() as {
                conversationId: string;
                metrics: { historyMessages: number };
            };
            assert.equal(secondResponse.status, 200);
            assert.equal(second.conversationId, first.conversationId);
            assert.equal(second.metrics.historyMessages, 2);
        }, { conversationStore });
    } finally {
        conversationStore.close();
    }

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].history, []);
    assert.deepEqual(calls[1].history.map(({ content }) => content), ["first message", "answer-1"]);
});

test("POST /chat keeps conversation histories separate and rejects an unknown ID", async () => {
    const conversationStore = new SqliteConversationStore(":memory:");
    const firstId = conversationStore.create();
    const secondId = conversationStore.create();
    conversationStore.append(firstId, "user", "first-only");
    conversationStore.append(secondId, "user", "second-only");
    const calls: Array<{ request: string; history: readonly { role: string; content: string }[] }> = [];
    const strategy: ReasoningStrategy = {
        name: "react",
        async run(input) {
            calls.push({ request: input.request, history: input.history ?? [] });
            return {
                answer: "ok",
                trace: [{ type: "answer", node: "test", text: "ok" }],
                metrics: { IICalls: 0, latencyMs: 1 },
            };
        },
    };

    try {
        await withChatServer(new Map([["react", strategy]]), async (baseUrl) => {
            for (const conversationId of [firstId, secondId]) {
                const response = await fetch(`${baseUrl}/chat`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ message: "follow-up", userId: "test-user", conversationId }),
                });
                assert.equal(response.status, 200);
            }

            const unknownResponse = await fetch(`${baseUrl}/chat`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: "must not run", userId: "test-user", conversationId: "unknown" }),
            });
            const unknown = await unknownResponse.json() as { error: { code: string } };
            assert.equal(unknownResponse.status, 404);
            assert.equal(unknown.error.code, "UNKNOWN_CONVERSATION");
        }, { conversationStore });
    } finally {
        conversationStore.close();
    }

    assert.deepEqual(calls.map(({ history }) => history[0]?.content), ["first-only", "second-only"]);
    assert.equal(calls.length, 2);
});

test("chat response schema validates operator-safe handoff events", () => {
    const body = chatResponseSchema.parse({
        requestId: "request-1",
        conversationId: "conversation-1",
        answer: "Incident facts collected.",
        trace: [{
            type: "handoff",
            node: "team",
            from: "supervisor",
            to: "analyst",
            brief: "Collect current incident facts.",
        }],
        metrics: {
            IICalls: 1,
            latencyMs: 1,
            promptTokens: null,
            contextBreakdown: {},
            historyMessages: 0,
        },
    });

    assert.deepEqual(body.trace[0], {
        type: "handoff",
        node: "team",
        from: "supervisor",
        to: "analyst",
        brief: "Collect current incident facts.",
    });
    assert.throws(() => chatResponseSchema.parse({
        requestId: "request-1",
        conversationId: "conversation-1",
        answer: "Incident facts collected.",
        trace: [{ type: "handoff", node: "team", from: "supervisor", to: "done", brief: "Finished." }],
        metrics: { IICalls: 1, latencyMs: 1, promptTokens: null, contextBreakdown: {}, historyMessages: 0 },
    }));
});