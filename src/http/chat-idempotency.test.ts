import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createChatApp } from "./server.js";
import type { ReasoningStrategy } from "../agents/reasoning.js";
import { SqliteConversationStore } from "../store/sqlite-conversation-store.js";
import { SqliteChatIdempotencyStore } from "../store/sqlite-chat-idempotency-store.js";
import { SqliteRequestTraceStore } from "../store/sqlite-request-trace-store.js";
import { EMBEDDING_DIMENSIONS } from "../memory/embeddings.js";
import { SqliteMemoryStore } from "../memory/memory-store.js";

async function withWarRoomServer(
    strategy: ReasoningStrategy,
    run: (baseUrl: string, conversations: SqliteConversationStore, traces: SqliteRequestTraceStore) => Promise<void>,
): Promise<void> {
    const conversations = new SqliteConversationStore(":memory:");
    const memories = new SqliteMemoryStore(":memory:", {
        embed: async () => new Float32Array(EMBEDDING_DIMENSIONS),
    });
    const traces = new SqliteRequestTraceStore(":memory:");
    const idempotency = new SqliteChatIdempotencyStore(":memory:");
    const server = createServer(createChatApp({
        strategies: new Map([[strategy.name, strategy]]),
        conversationStore: conversations,
        memoryStore: memories,
        requestTraceStore: traces,
        chatIdempotencyStore: idempotency,
        warRoomConfig: { userId: "configured-operator", webOrigins: ["http://localhost:5173"] },
        logger: { info: () => {} },
    }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
        await run(baseUrl, conversations, traces);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
        conversations.close();
        memories.close();
        traces.close();
        idempotency.close();
    }
}

function warRoomRequest(baseUrl: string, key: string, message: string, conversationId?: string): Promise<Response> {
    return fetch(`${baseUrl}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json", "Idempotency-Key": key },
        body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) }),
    });
}

test("War Room retries replay the response and preserve configured identity without repeating a turn", async () => {
    let invocations = 0;
    const strategy: ReasoningStrategy = {
        name: "react",
        async run(input) {
            invocations += 1;
            return {
                answer: `answer:${input.request}`,
                trace: [{ type: "answer", node: "test", text: `answer:${input.request}` }],
                metrics: { IICalls: 1, latencyMs: 1 },
            };
        },
    };

    await withWarRoomServer(strategy, async (baseUrl, conversations, traces) => {
        const first = await warRoomRequest(baseUrl, "turn-1", "inspect alert");
        const firstBody = await first.json() as { requestId: string; conversationId: string };
        const replay = await warRoomRequest(baseUrl, "turn-1", "inspect alert");
        assert.equal(replay.status, 200);
        assert.deepEqual(await replay.json(), firstBody);
        assert.equal(invocations, 1);
        assert.equal(conversations.lastMessages(firstBody.conversationId, 10).length, 2);
        const trace = traces.getRequestWithTrace(firstBody.requestId);
        assert.ok(trace);
        assert.equal(trace.request.userId, "configured-operator");

        const followUp = await warRoomRequest(baseUrl, "turn-2", "follow-up", firstBody.conversationId);
        const followUpBody = await followUp.json() as { conversationId: string };
        assert.equal(followUp.status, 200);
        assert.equal(followUpBody.conversationId, firstBody.conversationId);
        assert.equal(conversations.lastMessages(firstBody.conversationId, 10).length, 4);
        assert.equal(invocations, 2);
    });
});

test("War Room rejects a mismatched key and reports active duplicate claims without re-executing", async () => {
    let release!: () => void;
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    let invocations = 0;
    const strategy: ReasoningStrategy = {
        name: "react",
        async run(input) {
            invocations += 1;
            if (input.request === "slow request") {
                started();
                await blocked;
            }
            return {
                answer: "done",
                trace: [{ type: "answer", node: "test", text: "done" }],
                metrics: { IICalls: 1, latencyMs: 1 },
            };
        },
    };

    await withWarRoomServer(strategy, async (baseUrl) => {
        const pending = warRoomRequest(baseUrl, "slow-turn", "slow request");
        await startedPromise;
        const active = await warRoomRequest(baseUrl, "slow-turn", "slow request");
        assert.equal(active.status, 409);
        assert.equal((await active.json() as { error: { code: string } }).error.code, "REQUEST_IN_PROGRESS");
        assert.equal(active.headers.get("retry-after"), "2");
        const mismatch = await warRoomRequest(baseUrl, "slow-turn", "different request");
        assert.equal(mismatch.status, 409);
        assert.equal((await mismatch.json() as { error: { code: string } }).error.code, "IDEMPOTENCY_KEY_REUSED");
        release();
        assert.equal((await pending).status, 200);
        assert.equal(invocations, 1);
    });
});
