import assert from "node:assert/strict";
import test from "node:test";
import { UnknownConversationError } from "../agents/errors.js";
import { SqliteConversationStore } from "./sqlite-conversation-store.js";

test("SQLite conversation store persists ordered messages and returns the latest requested messages", () => {
    let nextId = 0;
    const store = new SqliteConversationStore(":memory:", {
        idFactory: () => `conversation-${++nextId}`,
        clock: () => new Date("2026-10-19T12:00:00.000Z"),
    });
    try {
        const conversationId = store.create();
        assert.equal(conversationId, "conversation-1");

        for (let index = 0; index < 14; index += 1) {
            store.append(conversationId, index % 2 === 0 ? "user" : "assistant", `message-${index}`);
        }

        const history = store.lastMessages(conversationId, 12);
        assert.equal(history.length, 12);
        assert.deepEqual(history.map(({ content }) => content), Array.from(
            { length: 12 },
            (_, index) => `message-${index + 2}`,
        ));
        assert.deepEqual(history.map(({ sequence }) => sequence), Array.from({ length: 12 }, (_, index) => index + 3));
        assert.ok(history.every(({ conversationId: owner, createdAt }) =>
            owner === conversationId && createdAt === "2026-10-19T12:00:00.000Z"));
        assert.equal(store.lastMessages(conversationId, 2).length, 2);
    } finally {
        store.close();
    }
});

test("SQLite conversation store isolates conversations and rejects unknown IDs", () => {
    const store = new SqliteConversationStore(":memory:");
    try {
        const firstId = store.create();
        const secondId = store.create();
        store.append(firstId, "user", "first conversation");
        store.append(secondId, "user", "second conversation");

        assert.deepEqual(store.lastMessages(firstId, 12).map(({ content }) => content), ["first conversation"]);
        assert.deepEqual(store.lastMessages(secondId, 12).map(({ content }) => content), ["second conversation"]);
        assert.throws(() => store.append("missing", "user", "no conversation"), UnknownConversationError);
        assert.throws(() => store.lastMessages("missing", 12), UnknownConversationError);
    } finally {
        store.close();
    }
});

test("SQLite conversation store persists and CAS-updates one merged summary", () => {
    const store = new SqliteConversationStore(":memory:", {
        clock: () => new Date("2026-10-29T12:00:00.000Z"),
    });
    try {
        const conversationId = store.create();
        for (let index = 0; index < 16; index += 1) {
            store.append(conversationId, index % 2 === 0 ? "user" : "assistant", `message-${index + 1}`);
        }

        assert.equal(store.getSummary(conversationId), null);
        assert.equal(store.saveSummary(conversationId, "Summary batch 1", 8, 0), true);
        assert.equal(store.getSummary(conversationId)?.summary, "Summary batch 1");
        assert.equal(store.saveSummary(conversationId, "stale summary", 16, 0), false);
        assert.equal(store.saveSummary(conversationId, "Merged summary", 16, 8), true);
        assert.equal(store.getSummary(conversationId)?.summarizedThroughSequence, 16);
    } finally {
        store.close();
    }
});

test("SQLite conversation store rejects invalid message data and history limits", () => {
    const store = new SqliteConversationStore(":memory:");
    try {
        const conversationId = store.create();
        assert.throws(() => store.append(conversationId, "user", "  "));
        assert.throws(() => store.lastMessages(conversationId, -1));
    } finally {
        store.close();
    }
});
