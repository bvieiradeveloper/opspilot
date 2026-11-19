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

test("War Room CORS allows exact origins and the required non-credentialed preflight", async () => {
    const conversationStore = new SqliteConversationStore(":memory:");
    const memoryStore = new SqliteMemoryStore(":memory:", {
        embed: async () => new Float32Array(EMBEDDING_DIMENSIONS),
    });
    const requestTraceStore = new SqliteRequestTraceStore(":memory:");
    const idempotencyStore = new SqliteChatIdempotencyStore(":memory:");
    const strategy: ReasoningStrategy = {
        name: "react",
        async run() {
            return {
                answer: "ok",
                trace: [{ type: "answer", node: "test", text: "ok" }],
                metrics: { IICalls: 0, latencyMs: 1 },
            };
        },
    };
    const server = createServer(createChatApp({
        strategies: new Map([["react", strategy]]),
        conversationStore,
        memoryStore,
        requestTraceStore,
        chatIdempotencyStore: idempotencyStore,
        warRoomConfig: { userId: "operator", webOrigins: ["http://localhost:5173"] },
        logger: { info: () => {} },
    }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
        const allowed = await fetch(`${baseUrl}/chat`, {
            method: "OPTIONS",
            headers: {
                Origin: "http://localhost:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,idempotency-key",
            },
        });
        assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:5173");
        assert.match(allowed.headers.get("access-control-allow-methods") ?? "", /POST/);
        assert.match(allowed.headers.get("access-control-allow-headers") ?? "", /Content-Type/i);
        assert.match(allowed.headers.get("access-control-allow-headers") ?? "", /Idempotency-Key/i);
        assert.equal(allowed.headers.get("access-control-allow-credentials"), null);

        const denied = await fetch(`${baseUrl}/chat`, {
            method: "OPTIONS",
            headers: {
                Origin: "https://attacker.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type,idempotency-key",
            },
        });
        assert.equal(denied.headers.get("access-control-allow-origin"), null);
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
        conversationStore.close();
        memoryStore.close();
        requestTraceStore.close();
        idempotencyStore.close();
    }
});
