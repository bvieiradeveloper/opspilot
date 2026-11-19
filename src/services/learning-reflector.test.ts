import assert from "node:assert/strict";
import test from "node:test";
import type { MemoryStore } from "../memory/memory-store.js";
import { createLearningReflector } from "./learning-reflector.js";

const durableAssessment = { hasLearning: true, fact: "Prefers critical alerts first." };

function fakeMemoryStore(remembered: string[]) : MemoryStore {
    return {
        async remember(userId, fact) {
            remembered.push(`${userId}:${fact}`);
            return {
                created: true,
                memory: {
                    id: "memory-1",
                    userId,
                    fact,
                    embedding: new Float32Array(384),
                    createdAt: "2026-10-21T22:00:00.000Z",
                },
            };
        },
        async recall() {
            return [];
        },
        list() {
            return [];
        },
        forget() {},
        close() {},
    };
}

test("learning reflector assesses only the latest user message and saves one eligible fact", async () => {
    const remembered: string[] = [];
    let assessedMessage = "";
    const reflector = createLearningReflector(fakeMemoryStore(remembered), async (message) => {
        assessedMessage = message;
        return durableAssessment;
    });

    await reflector({ userId: "user-1", message: "I prefer critical alerts first." });

    assert.equal(assessedMessage, "I prefer critical alerts first.");
    assert.deepEqual(remembered, ["user-1:Prefers critical alerts first."]);
});

test("learning reflector skips explicit no-learning assessments", async () => {
    const remembered: string[] = [];
    const reflector = createLearningReflector(fakeMemoryStore(remembered), async () => ({
        hasLearning: false,
        fact: null,
    }));
    await reflector({ userId: "user-1", message: "What time is it?" });
    assert.deepEqual(remembered, []);
});

test("learning reflector rejects secret-like candidates", async () => {
    const remembered: string[] = [];
    const secretCandidates = [
        { hasLearning: true, fact: "My password is hunter2." },
        { hasLearning: true, fact: "Use this bearer token: abc.def.ghi." },
        { hasLearning: true, fact: "My one-time verification code is 123456." },
        { hasLearning: true, fact: "The API key is sk-live-abcdef0123456789." },
    ];

    for (const assessment of secretCandidates) {
        const reflector = createLearningReflector(fakeMemoryStore(remembered), async () => assessment);
        await reflector({ userId: "user-1", message: "I also prefer concise answers." });
    }

    assert.deepEqual(remembered, []);
});

test("learning reflector can retain a safe preference without retaining a secret from the same message", async () => {
    const remembered: string[] = [];
    const reflector = createLearningReflector(fakeMemoryStore(remembered), async (message) => {
        assert.match(message, /password is secret-value/);
        return { hasLearning: true, fact: "Prefers concise answers." };
    });

    await reflector({
        userId: "user-1",
        message: "My password is secret-value, and I prefer concise answers.",
    });

    assert.deepEqual(remembered, ["user-1:Prefers concise answers."]);
});

test("learning reflector rejects inconsistent structured assessments", async () => {
    const remembered: string[] = [];
    const reflector = createLearningReflector(fakeMemoryStore(remembered), async () => ({
        hasLearning: false,
        fact: "Unexpected fact.",
    }));

    await assert.rejects(
        reflector({ userId: "user-1", message: "I prefer critical alerts first." }),
        /inconsistent learning assessment/i,
    );
    assert.deepEqual(remembered, []);
});

test("learning reflector propagates extraction errors without persisting", async () => {
    const remembered: string[] = [];
    const failed = createLearningReflector(fakeMemoryStore(remembered), async () => {
        throw new Error("extractor failed");
    });
    await assert.rejects(
        failed({ userId: "user-1", message: "Remember this." }),
        /extractor failed/,
    );
    assert.deepEqual(remembered, []);
});
