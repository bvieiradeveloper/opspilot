import assert from "node:assert/strict";
import test from "node:test";
import { buildContext, ContextBudgetError } from "./context-builder.js";

test("context budget preserves immutable system and current request", () => {
    const system = "Do not leak private reasoning.";
    const message = "This current request must remain complete.";
    const context = buildContext({
        system,
        message,
        summary: "x".repeat(2000),
        history: [{ role: "assistant", content: "y".repeat(2000) }],
        memories: [{ fact: "z".repeat(2000), score: 0.1 }],
        environment: {
            CONTEXT_BUDGET_SUMMARY: "1",
            CONTEXT_BUDGET_HISTORY: "1",
            CONTEXT_BUDGET_MEMORIES: "1",
        },
    });

    assert.equal(context.system, system);
    assert.equal(context.message, message);
});

test("context budget removes oldest history before recent history", () => {
    const context = buildContext({
        message: "question",
        history: [
            { role: "user", content: "oldest message" },
            { role: "assistant", content: "middle message" },
            { role: "user", content: "newest message" },
        ],
        environment: { CONTEXT_BUDGET_HISTORY: "12" },
    });

    assert.deepEqual(context.history.map(({ content }) => content), ["middle message", "newest message"]);
});

test("context budget removes lowest-score memories first", () => {
    const context = buildContext({
        message: "question",
        memories: [
            { fact: "high priority", score: 0.9 },
            { fact: "low priority", score: 0.1 },
            { fact: "medium priority", score: 0.5 },
        ],
        environment: { CONTEXT_BUDGET_MEMORIES: "8" },
    });

    assert.deepEqual(context.memories.map(({ fact }) => fact), ["high priority", "medium priority"]);
});

test("context budget uses corrected defaults and keeps equal-score ties stable", () => {
    const context = buildContext({
        message: "question",
        memories: [
            { fact: "first tied", score: 0.5 },
            { fact: "second tied", score: 0.5 },
            { fact: "highest", score: 0.9 },
        ],
    });

    assert.equal(context.budgets.summary, 100);
    assert.equal(context.budgets.history, 300);
    assert.equal(context.budgets.memories, 100);
    assert.deepEqual(context.memories.map(({ fact }) => fact), ["first tied", "second tied", "highest"]);
});

test("context budget rejects invalid environment values", () => {
    assert.throws(
        () => buildContext({ message: "question", environment: { CONTEXT_BUDGET_SUMMARY: "0" } }),
        ContextBudgetError,
    );
    assert.throws(
        () => buildContext({ message: "question", environment: { CONTEXT_BUDGET_HISTORY: "abc" } }),
        ContextBudgetError,
    );
});

test("context budget truncates summary to its configured estimate", () => {
    const context = buildContext({
        message: "question",
        summary: "0123456789abcdefghij",
        environment: { CONTEXT_BUDGET_SUMMARY: "3" },
    });

    assert.equal(context.summary, "0123456789ab");
});
