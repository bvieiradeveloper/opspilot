import assert from "node:assert/strict";
import test from "node:test";
import { ApiRequestError, sendChatMessage } from "./chat-api.js";

const responseBody = {
    requestId: "request-1",
    conversationId: "conversation-1",
    answer: "Answer",
    trace: [{ type: "answer", node: "react", text: "Answer" }],
    metrics: {
        IICalls: 1,
        latencyMs: 1,
        promptTokens: null,
        contextBreakdown: {},
        historyMessages: 0,
    },
};

test("chat client omits the first conversation ID and reuses the supplied retry key", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const doFetch: typeof fetch = async (input, init) => {
        requests.push({ url: String(input), init });
        return new Response(JSON.stringify(responseBody), { status: 200 });
    };

    await sendChatMessage({ message: "hello", idempotencyKey: "stable-key", apiBaseUrl: "http://localhost:3000" }, doFetch);
    await sendChatMessage({ message: "hello", idempotencyKey: "stable-key", apiBaseUrl: "http://localhost:3000" }, doFetch);
    assert.equal(requests.length, 2);
    for (const request of requests) {
        assert.equal(request.url, "http://localhost:3000/chat");
        assert.equal((request.init?.headers as Record<string, string>)["Idempotency-Key"], "stable-key");
        assert.deepEqual(JSON.parse(String(request.init?.body)), { message: "hello" });
    }
});

test("chat client sends a follow-up conversation ID and validates its response", async () => {
    const doFetch: typeof fetch = async (_input, init) => {
        assert.deepEqual(JSON.parse(String(init?.body)), { message: "follow up", conversationId: "conversation-1" });
        return new Response(JSON.stringify(responseBody), { status: 200 });
    };
    const result = await sendChatMessage({
        message: "follow up",
        conversationId: "conversation-1",
        idempotencyKey: "key-2",
        apiBaseUrl: "http://localhost:3000",
    }, doFetch);
    assert.equal(result.response.conversationId, "conversation-1");
    await assert.rejects(() => sendChatMessage({
        message: "bad",
        idempotencyKey: "key-3",
        apiBaseUrl: "http://localhost:3000",
    }, async () => new Response("{", { status: 200 })), ApiRequestError);
});

test("chat client sends an explicitly selected team strategy", async () => {
    const doFetch: typeof fetch = async (_input, init) => {
        assert.deepEqual(JSON.parse(String(init?.body)), { message: "Investigate incident", strategy: "team" });
        return new Response(JSON.stringify(responseBody), { status: 200 });
    };
    await sendChatMessage({
        message: "Investigate incident",
        strategy: "team",
        idempotencyKey: "team-key",
        apiBaseUrl: "http://localhost:3000",
    }, doFetch);
});

test("chat client validates HTTP 202 approvals and surfaces HTTP and network failures", async () => {
    await assert.rejects(() => sendChatMessage({
        message: "pending",
        idempotencyKey: "key-4",
        apiBaseUrl: "http://localhost:3000",
    }, async () => new Response(JSON.stringify(responseBody), { status: 202 })), /pending-approval/i);
    await assert.rejects(() => sendChatMessage({
        message: "bad",
        idempotencyKey: "key-5",
        apiBaseUrl: "http://localhost:3000",
    }, async () => new Response(JSON.stringify({ error: { code: "NOPE", message: "Unavailable" } }), { status: 503 })), /Unavailable/);
    await assert.rejects(() => sendChatMessage({
        message: "offline",
        idempotencyKey: "key-6",
        apiBaseUrl: "http://localhost:3000",
    }, async () => { throw new TypeError("fetch failed"); }), /CORS/);
});
