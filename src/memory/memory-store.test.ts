import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { EMBEDDING_DIMENSIONS, type Embedding } from "./embeddings.js";
import { dot, MemoryNotFoundError, SqliteMemoryStore } from "./memory-store.js";

function vector(values: Record<number, number>): Embedding {
    const result = new Float32Array(EMBEDDING_DIMENSIONS);
    for (const [index, value] of Object.entries(values)) {
        result[Number(index)] = value;
    }
    return result;
}

function setup() {
    const vectors = new Map<string, Embedding>();
    let id = 0;
    const store = new SqliteMemoryStore(":memory:", {
        embed: async (text) => vectors.get(text) ?? vector({ 0: 1 }),
        idFactory: () => `memory-${++id}`,
        clock: () => new Date("2026-10-21T22:00:00.000Z"),
    });
    return { store, vectors };
}

test("memory store creates schema, persists metadata and round-trips float32 BLOB values", async (t) => {
    const { store, vectors } = setup();
    t.after(() => store.close());
    const expected = vector({ 0: 0.75, 1: 0.25 });
    vectors.set("fact", expected);

    const created = await store.remember("user-a", " fact ");
    const listed = store.list("user-a");

    assert.equal(created.created, true);
    assert.equal(created.memory.fact, "fact");
    assert.equal(created.memory.embedding.length, EMBEDDING_DIMENSIONS);
    assert.deepEqual(listed[0]?.embedding, expected);
    assert.equal(listed[0]?.createdAt, "2026-10-21T22:00:00.000Z");
});

test("memory store deduplicates only same-user facts above 0.92", async (t) => {
    const { store, vectors } = setup();
    t.after(() => store.close());
    vectors.set("first", vector({ 0: 1 }));
    vectors.set("similar", vector({ 0: 0.95, 1: 0.3122499 }));
    vectors.set("different", vector({ 1: 1 }));

    const first = await store.remember("user-a", "first");
    const duplicate = await store.remember("user-a", "similar");
    const separate = await store.remember("user-a", "different");
    const otherOwner = await store.remember("user-b", "similar");

    assert.equal(first.created, true);
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.memory.id, first.memory.id);
    assert.equal(separate.created, true);
    assert.equal(otherOwner.created, true);
    assert.equal(store.list("user-a").length, 2);
    assert.equal(store.list("user-b").length, 1);
});

test("recall filters at 0.30, sorts by dot product, and caps results at three", async (t) => {
    const { store, vectors } = setup();
    t.after(() => store.close());
    vectors.set("query", vector({ 0: 1 }));
    vectors.set("below-threshold", vector({ 0: 0.29, 5: Math.sqrt(1 - 0.29 ** 2) }));
    vectors.set("at-threshold", vector({ 0: 0.3, 6: Math.sqrt(1 - 0.3 ** 2) }));
    vectors.set("rank-1", vector({ 0: 0.9, 1: Math.sqrt(1 - 0.9 ** 2) }));
    vectors.set("rank-2", vector({ 0: 0.8, 2: Math.sqrt(1 - 0.8 ** 2) }));
    vectors.set("rank-3", vector({ 0: 0.7, 3: Math.sqrt(1 - 0.7 ** 2) }));
    vectors.set("rank-4", vector({ 0: 0.6, 4: Math.sqrt(1 - 0.6 ** 2) }));
    vectors.set("boundary-only", vector({ 0: 0.3, 7: Math.sqrt(1 - 0.3 ** 2) }));
    await store.remember("boundary-user", "boundary-only");
    for (const fact of ["below-threshold", "at-threshold", "rank-1", "rank-2", "rank-3", "rank-4"]) {
        await store.remember("user-a", fact);
    }

    const result = await store.recall("user-a", "query", 10);

    assert.deepEqual(result.map(({ fact }) => fact), ["rank-1", "rank-2", "rank-3"]);
    assert.equal(result.length, 3);
    assert.equal((await store.recall("boundary-user", "query")).some(({ fact }) => fact === "boundary-only"), true);
    assert.equal((await store.recall("user-a", "query")).some(({ fact }) => fact === "below-threshold"), false);
});

test("recall only uses memories belonging to the requested user", async (t) => {
    const { store, vectors } = setup();
    t.after(() => store.close());
    vectors.set("query", vector({ 0: 1 }));
    vectors.set("owner-fact", vector({ 0: 1 }));
    await store.remember("user-a", "owner-fact");
    vectors.set("foreign-fact", vector({ 0: 1 }));
    await store.remember("user-b", "foreign-fact");

    assert.deepEqual((await store.recall("user-a", "query")).map(({ fact }) => fact), ["owner-fact"]);
});

test("forget requires both owner and memory ID and leaves other memories untouched", async (t) => {
    const { store, vectors } = setup();
    t.after(() => store.close());
    vectors.set("first", vector({ 0: 1 }));
    vectors.set("second", vector({ 1: 1 }));
    const first = await store.remember("user-a", "first");
    const second = await store.remember("user-a", "second");

    assert.throws(() => store.forget("user-b", first.memory.id), MemoryNotFoundError);
    assert.throws(() => store.forget("user-a", "missing"), MemoryNotFoundError);
    store.forget("user-a", first.memory.id);
    assert.deepEqual(store.list("user-a").map(({ id }) => id), [second.memory.id]);
});

test("invalid user, fact, query, and vector data are rejected", async (t) => {
    const { store } = setup();
    t.after(() => store.close());

    await assert.rejects(store.remember(" ", "fact"));
    await assert.rejects(store.remember("user-a", " "));
    await assert.rejects(store.recall("user-a", " "));
    assert.throws(() => dot(new Float32Array(1), new Float32Array(1)), /384 finite/);
});

test("configured SQLite memory table has owner-scoped created-time index", (t) => {
    const path = join(tmpdir(), `opspilot-memory-${randomUUID()}.db`);
    const store = new SqliteMemoryStore(path, { embed: async () => vector({ 0: 1 }) });
    const probe = new DatabaseSync(path);
    t.after(() => {
        probe.close();
        store.close();
        rmSync(path, { force: true });
    });
    assert.ok(probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memories'").get());
    assert.ok(probe.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'memories_user_created_at'").get());
});
