import assert from "node:assert/strict";
import test from "node:test";
import { SqliteChatIdempotencyStore } from "./sqlite-chat-idempotency-store.js";

test("idempotency store claims unique keys, detects mismatches, and replays terminal responses", () => {
    const store = new SqliteChatIdempotencyStore(":memory:");
    const now = new Date("2026-11-12T12:00:00.000Z");
    try {
        assert.deepEqual(store.claim("message-1", "fingerprint-a", now), { kind: "claimed" });
        assert.deepEqual(store.claim("message-1", "fingerprint-a", now), { kind: "processing" });
        assert.deepEqual(store.claim("message-1", "fingerprint-b", now), { kind: "mismatch" });

        const responseBody = { answer: "done" };
        store.complete("message-1", "fingerprint-a", 200, responseBody, now);
        assert.deepEqual(store.claim("message-1", "fingerprint-a", now), {
            kind: "replay",
            responseStatus: 200,
            responseBody,
        });
    } finally {
        store.close();
    }
});

test("idempotency records, including processing claims, expire after 24 hours", () => {
    const store = new SqliteChatIdempotencyStore(":memory:");
    const now = new Date("2026-11-12T12:00:00.000Z");
    try {
        assert.deepEqual(store.claim("message-1", "fingerprint-a", now), { kind: "claimed" });
        assert.deepEqual(store.claim("message-1", "fingerprint-a", new Date(now.getTime() + 24 * 60 * 60 * 1000)), { kind: "claimed" });
    } finally {
        store.close();
    }
});

test("idempotency keys are bounded opaque values", () => {
    const store = new SqliteChatIdempotencyStore(":memory:");
    try {
        assert.throws(() => store.claim("", "fingerprint", new Date()), /key/i);
        assert.throws(() => store.claim("x".repeat(201), "fingerprint", new Date()), /key/i);
    } finally {
        store.close();
    }
});
