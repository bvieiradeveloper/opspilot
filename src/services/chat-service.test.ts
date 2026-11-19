import assert from "node:assert/strict";
import test from "node:test";
import type { ConversationMessage, ConversationStore } from "../store/conversation-store.js";
import type { ReasoningStrategy } from "../agents/reasoning.js";
import type { MemoryStore } from "../memory/memory-store.js";
import { ModelUnavailableError } from "../agents/errors.js";
import { runChat } from "./chat-service.js";

function createFakeStore(initial: ConversationMessage[] = []) {
    const messages = [...initial];
    const operations: string[] = [];
    let nextId = 0;
    const store: ConversationStore = {
        create() {
            operations.push("create");
            return `new-${++nextId}`;
        },
        append(conversationId, role, content) {
            operations.push(`append:${role}:${content}`);
            messages.push({
                conversationId,
                role,
                content,
                sequence: messages.length + 1,
                createdAt: "2026-10-19T12:00:00.000Z",
            });
        },
        lastMessages(conversationId, limit) {
            operations.push(`lastMessages:${limit}`);
            return messages.filter(({ conversationId: owner }) => owner === conversationId).slice(-limit);
        },
        close() {},
    };
    return { store, messages, operations };
}

function makeHistory(count: number, conversationId = "conversation-1"): ConversationMessage[] {
    return Array.from({ length: count }, (_, index) => ({
        conversationId,
        role: index % 2 === 0 ? "user" : "assistant",
        content: `history-${index}`,
        sequence: index + 1,
        createdAt: "2026-10-19T12:00:00.000Z",
    }));
}

function createMemoryStore(): MemoryStore {
    return {
        async remember() {
            throw new Error("Not used by this test.");
        },
        async recall() {
            return [];
        },
        list() {
            return [];
        },
        forget() {
            throw new Error("Not used by this test.");
        },
        close() {},
    };
}

test("runChat loads history, appends user before strategy and assistant after successful strategy", async () => {
    const history = makeHistory(3);
    const { store, messages, operations } = createFakeStore(history);
    let strategyInput: Parameters<ReasoningStrategy["run"]>[0] | undefined;
    const strategy: ReasoningStrategy = {
        name: "fake",
        async run(input) {
            strategyInput = input;
            return {
                answer: "assistant answer",
                trace: [{ type: "answer", node: "react", text: "assistant answer" }],
                metrics: { IICalls: 1, latencyMs: 5 },
            };
        },
    };

    const result = await runChat({ userId: "user-1", message: "current question", conversationId: "conversation-1" }, {
        conversations: store,
        memories: createMemoryStore(),
        strategy,
    });

    test("runChat does not append an assistant success message when all model candidates fail", async () => {
        const { store, messages } = createFakeStore();
        const strategy: ReasoningStrategy = {
            name: "react",
            async run() {
                throw new ModelUnavailableError();
            },
        };

        await assert.rejects(runChat({ userId: "user-1", message: "Check status" }, {
            conversations: store,
            memories: createMemoryStore(),
            strategy,
        }), ModelUnavailableError);

        assert.deepEqual(messages.map(({ role }) => role), ["user"]);
    });

    assert.deepEqual(operations, ["lastMessages:8", "append:user:current question", "append:assistant:assistant answer"]);
    assert.deepEqual(strategyInput?.history?.map(({ content }) => content), history.map(({ content }) => content));
    assert.equal(strategyInput?.request, "current question");
    assert.deepEqual(result, {
        conversationId: "conversation-1",
        answer: "assistant answer",
        trace: [{ type: "answer", node: "react", text: "assistant answer" }],
        metrics: { IICalls: 1, latencyMs: 5, promptTokens: null, contextBreakdown: { request: 4, history: 13 }, historyMessages: 3 },
    });
    assert.equal(messages.at(-2)?.role, "user");
    assert.equal(messages.at(-1)?.role, "assistant");
});

test("runChat recalls only the request user's facts and supplies them as strategy context", async () => {
    const { store } = createFakeStore();
    const memoryStore = createMemoryStore();
    let recalledUserId = "";
    let receivedMemories: readonly { fact: string; score: number }[] = [];
    memoryStore.recall = async (userId, query) => {
        recalledUserId = `${userId}:${query}`;
        return [{ id: "memory-1", userId, fact: "Prefers critical alerts first.", embedding: new Float32Array(384), createdAt: "2026-10-21T22:00:00.000Z", score: 0.8 }];
    };
    const strategy: ReasoningStrategy = {
        name: "fake",
        async run(input) {
            receivedMemories = input.memories ?? [];
            return { answer: "ok", trace: [{ type: "answer", node: "react", text: "ok" }], metrics: { IICalls: 0, latencyMs: 1 } };
        },
    };

    await runChat({ userId: "user-a", message: "Which alerts first?" }, {
        conversations: store,
        memories: memoryStore,
        strategy,
    });

    assert.equal(recalledUserId, "user-a:Which alerts first?");
    assert.equal(receivedMemories[0]?.fact, "Prefers critical alerts first.");
});

test("runChat memory forgetting deletes only one semantic match and reports ambiguity", async () => {
    const { store } = createFakeStore();
    const memoryStore = createMemoryStore();
    const deleted: string[] = [];
    memoryStore.recall = async (userId, query) => query === "ambiguous preference"
        ? [
            { id: "memory-1", userId, fact: "First fact.", embedding: new Float32Array(384), createdAt: "2026-10-21T22:00:00.000Z", score: 0.8 },
            { id: "memory-2", userId, fact: "Second fact.", embedding: new Float32Array(384), createdAt: "2026-10-21T22:01:00.000Z", score: 0.7 },
        ]
        : query === "unique preference"
            ? [{ id: "memory-1", userId, fact: "First fact.", embedding: new Float32Array(384), createdAt: "2026-10-21T22:00:00.000Z", score: 0.8 }]
            : [];
    memoryStore.forget = (userId, memoryId) => {
        deleted.push(`${userId}:${memoryId}`);
    };
    const strategy: ReasoningStrategy = {
        name: "fake",
        async run(input) {
            const ambiguous = await input.memoryOperations!.forget("ambiguous preference");
            const unique = await input.memoryOperations!.forget("unique preference");
            const missing = await input.memoryOperations!.forget("missing preference");
            assert.equal(ambiguous.forgotten, false);
            assert.equal(ambiguous.needsClarification, true);
            assert.equal(unique.forgotten, true);
            assert.equal(missing.forgotten, false);
            assert.equal(missing.needsClarification, true);
            return { answer: "ok", trace: [{ type: "answer", node: "react", text: "ok" }], metrics: { IICalls: 0, latencyMs: 1 } };
        },
    };

    await runChat({ userId: "user-a", message: "Forget something." }, {
        conversations: store,
        memories: memoryStore,
        strategy,
    });

    assert.deepEqual(deleted, ["user-a:memory-1"]);
});

test("runChat creates and persists a summary once at the first 8-message boundary and supplies it before recent history", async () => {
    const messages = makeHistory(16);
    const summaryState: { current: { summary: string; summarizedThroughSequence: number } | null } = { current: null };
    let summarizeCalls = 0;
    const store: ConversationStore = {
        create() { return "conversation-1"; },
        append(conversationId, role, content) {
            messages.push({ conversationId, role, content, sequence: messages.length + 1, createdAt: "2026-10-29T12:00:00.000Z" });
        },
        lastMessages(conversationId, limit) {
            return messages.filter((message) => message.conversationId === conversationId).slice(-limit);
        },
        getSummary() {
            return summaryState.current ? { conversationId: "conversation-1", ...summaryState.current, updatedAt: "2026-10-29T12:00:00.000Z" } : null;
        },
        saveSummary(conversationId, mergedSummary, sequence, expectedSequence) {
            if ((summaryState.current?.summarizedThroughSequence ?? 0) !== expectedSequence) return false;
            summaryState.current = { summary: mergedSummary, summarizedThroughSequence: sequence };
            return true;
        },
        close() {},
    };
    let strategyInput: Parameters<ReasoningStrategy["run"]>[0] | undefined;
    const strategy: ReasoningStrategy = {
        name: "fake",
        async run(input) {
            strategyInput = input;
            return { answer: "ok", trace: [{ type: "answer", node: "react", text: "ok" }], metrics: { IICalls: 0, latencyMs: 1 } };
        },
    };

    const result = await runChat({ userId: "user-1", message: "next", conversationId: "conversation-1" }, {
        conversations: store,
        memories: createMemoryStore(),
        strategy,
        summarizer: {
            async summarize(previous, batch) {
                summarizeCalls += 1;
                assert.equal(previous, null);
                assert.equal(batch.length, 8);
                assert.equal(batch[0]?.sequence, 1);
                assert.equal(batch.at(-1)?.sequence, 8);
                return "- Decisão: usar janela curta\n- Fato: incidente aberto\n- Pendente: resolver inventário";
            },
        },
    });

    assert.equal(summarizeCalls, 1);
    assert.equal(summaryState.current?.summarizedThroughSequence, 8);
    assert.equal(strategyInput?.summary?.includes("Decisão"), true);
    assert.equal(strategyInput?.history?.length, 8);
    assert.equal(result.trace.some((event) => event.type === "summarize"), true);
});

test("runChat merges exactly one batch and does not summarize again below the next 8-message boundary", async () => {
    const messages = makeHistory(17);
    let summary = { summary: "Resumo anterior", summarizedThroughSequence: 8 };
    let summarizeCalls = 0;
    const store: ConversationStore = {
        create() { return "conversation-1"; },
        append(conversationId, role, content) {
            messages.push({ conversationId, role, content, sequence: messages.length + 1, createdAt: "2026-10-29T12:00:00.000Z" });
        },
        lastMessages(conversationId, limit) { return messages.filter((message) => message.conversationId === conversationId).slice(-limit); },
        getSummary() { return { conversationId: "conversation-1", ...summary, updatedAt: "2026-10-29T12:00:00.000Z" }; },
        saveSummary(conversationId, mergedSummary, sequence, expectedSequence) {
            if (summary.summarizedThroughSequence !== expectedSequence) return false;
            summary = { summary: mergedSummary, summarizedThroughSequence: sequence };
            return true;
        },
        close() {},
    };
    const strategy: ReasoningStrategy = {
        name: "fake",
        async run() { return { answer: "ok", trace: [{ type: "answer", node: "react", text: "ok" }], metrics: { IICalls: 0, latencyMs: 1 } }; },
    };

    await runChat({ userId: "user-1", message: "next", conversationId: "conversation-1" }, {
        conversations: store,
        memories: createMemoryStore(),
        strategy,
        summarizer: {
            async summarize() { summarizeCalls += 1; return "unexpected"; },
        },
    });

    assert.equal(summarizeCalls, 0);
    assert.equal(summary.summarizedThroughSequence, 8);
});

for (const count of [0, 3, 8, 14]) {
    test(`runChat sends at most 8 prior messages and reports ${Math.min(count, 8)} for ${count} available`, async () => {
        const history = makeHistory(count);
        const { store } = createFakeStore(history);
        let suppliedHistory: readonly { role: string; content: string }[] = [];
        const strategy: ReasoningStrategy = {
            name: "fake",
            async run(input) {
                suppliedHistory = input.history ?? [];
                return { answer: "ok", trace: [{ type: "answer", node: "react", text: "ok" }], metrics: { IICalls: 0, latencyMs: 1 } };
            },
        };

        const result = await runChat({ userId: "user-1", message: "next", conversationId: "conversation-1" }, {
            conversations: store,
            memories: createMemoryStore(),
            strategy,
        });

        assert.equal(suppliedHistory.length, Math.min(count, 8));
        assert.equal(result.metrics.historyMessages, Math.min(count, 8));
    });
}
