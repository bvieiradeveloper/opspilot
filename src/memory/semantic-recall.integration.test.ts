import assert from "node:assert/strict";
import test from "node:test";
import { SqliteMemoryStore } from "./memory-store.js";

test("local embeddings recall a related fact with no words in common", {
    skip: process.env.RUN_SEMANTIC_INTEGRATION !== "1",
}, async (t) => {
    const store = new SqliteMemoryStore(":memory:", {
        embed: async (text) => {
            const { embed } = await import("./embeddings.js");
            return embed(text);
        },
    });
    t.after(() => store.close());

    await store.remember("semantic-test-user", "I prefer urgent notifications to appear before everything else.");
    const recalled = await store.recall("semantic-test-user", "Which kind of message should be at the front of my display?");

    assert.equal(recalled[0]?.fact, "I prefer urgent notifications to appear before everything else.");
    assert.ok((recalled[0]?.score ?? 0) >= 0.3);
    const vector = await (await import("./embeddings.js")).embed("A normalization check.");
    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    assert.ok(Math.abs(norm - 1) < 1e-5);
});
