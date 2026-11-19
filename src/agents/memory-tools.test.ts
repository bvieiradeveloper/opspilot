import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryTools } from "./memory-tools.js";

test("memory tools list facts and delete only the explicitly selected ID", async () => {
    const facts = [
        { id: "memory-1", fact: "Prefers critical alerts first.", createdAt: "2026-10-21T22:00:00.000Z" },
        { id: "memory-2", fact: "Uses dark mode.", createdAt: "2026-10-21T22:01:00.000Z" },
    ];
    const forgotten: string[] = [];
    const tools = createMemoryTools({
        list: () => facts,
        async remember(fact) {
            const memory = { id: "memory-3", fact, createdAt: "2026-10-21T22:02:00.000Z" };
            facts.push(memory);
            return memory;
        },
        async forget(preference) {
            const matches = facts.filter(({ fact }) => fact.includes(preference));
            if (matches.length !== 1) {
                return {
                    forgotten: false,
                    needsClarification: matches.length > 1,
                    candidates: matches.map(({ id, fact }) => ({ id, fact })),
                };
            }
            const [match] = matches;
            facts.splice(facts.findIndex(({ id }) => id === match!.id), 1);
            forgotten.push(match!.id);
            return { forgotten: true, needsClarification: false, candidates: [{ id: match!.id, fact: match!.fact }] };
        },
    });
    const [list, remember, forget] = tools;

    assert.deepEqual(JSON.parse(await list.invoke({})), facts);
    assert.deepEqual(JSON.parse(await remember.invoke({ fact: "Prefers short summaries." })), {
        id: "memory-3",
        fact: "Prefers short summaries.",
        createdAt: "2026-10-21T22:02:00.000Z",
    });
    assert.equal(forget.name, "forget_preference");
    await forget.invoke({ preference: "critical alerts" });
    assert.deepEqual(forgotten, ["memory-1"]);
    assert.deepEqual(facts.map(({ id }) => id), ["memory-2", "memory-3"]);
});

test("memory forget tool validates a non-empty fact description", async () => {
    const tools = createMemoryTools({
        list: () => [],
        async remember(fact) {
            return { id: "memory-1", fact, createdAt: "2026-10-21T22:00:00.000Z" };
        },
        async forget(preference) {
            return { forgotten: false, needsClarification: true, candidates: [{ id: "memory-1", fact: preference }] };
        },
    });
    const forget = tools[2];

    await assert.rejects(forget.invoke({ preference: "" }));
});

test("memory forget tool reports ambiguity without deleting a candidate", async () => {
    let forgetCalls = 0;
    const tools = createMemoryTools({
        list: () => [],
        async remember(fact) {
            return { id: "memory-1", fact, createdAt: "2026-10-21T22:00:00.000Z" };
        },
        async forget() {
            forgetCalls += 1;
            return {
                forgotten: false,
                needsClarification: true,
                candidates: [
                    { id: "memory-1", fact: "Prefers critical alerts first." },
                    { id: "memory-2", fact: "Prefers critical incidents first." },
                ],
            };
        },
    });

    const result = JSON.parse(await tools[2].invoke({ preference: "forget my preference" })) as {
        forgotten: boolean;
        needsClarification: boolean;
        candidates: Array<{ id: string }>;
    };
    assert.equal(result.forgotten, false);
    assert.equal(result.needsClarification, true);
    assert.equal(result.candidates.length, 2);
    assert.equal(forgetCalls, 1);
});

test("memory forget tool reports a missing preference as requiring clarification", async () => {
    let deleteAttempts = 0;
    const tools = createMemoryTools({
        list: () => [],
        async remember(fact) {
            return { id: "memory-1", fact, createdAt: "2026-10-21T22:00:00.000Z" };
        },
        async forget() {
            deleteAttempts += 1;
            return { forgotten: false, needsClarification: true, candidates: [] };
        },
    });

    const result = JSON.parse(await tools[2].invoke({ preference: "my old preference" })) as {
        forgotten: boolean;
        needsClarification: boolean;
        candidates: unknown[];
    };
    assert.equal(result.forgotten, false);
    assert.equal(result.needsClarification, true);
    assert.deepEqual(result.candidates, []);
    assert.equal(deleteAttempts, 1);
});
