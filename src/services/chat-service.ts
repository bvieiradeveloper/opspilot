import { z } from "zod";
import { addContextEstimate, mergeContextBreakdowns, type ContextBreakdown } from "../context/tokens.js";
import type { ReasoningResult, ReasoningStrategy } from "../agents/reasoning.js";
import type { ConversationStore } from "../store/conversation-store.js";
import type { MemoryStore } from "../memory/memory-store.js";
import { ConversationSummarizationError, ModelUnavailableError } from "../agents/errors.js";
import { createConversationSummarizer, type ConversationSummarizer } from "./conversation-summarizer.js";
import { runProductionGraph, type ProductionGraphOptions } from "../graph/production-graph.js";
import type { TraceEvent } from "../agents/reasoning.js";

const chatInputSchema = z.object({
    message: z.string().trim().min(1),
    userId: z.string().trim().min(1),
    conversationId: z.string().trim().min(1).optional(),
    strategy: z.enum(["react", "plan-and-execute", "reflect:react"]).optional(),
    reflect: z.boolean().optional(),
});

const CHAT_HISTORY_LIMIT = 8;
const PRUNING_BATCH_SIZE = 8;
const MAX_HISTORY_LOOKUP = 100_000;

const summaryRefreshLocks = new Map<string, Promise<void>>();

export type ChatServiceInput = z.input<typeof chatInputSchema>;
export type ChatServiceOptions = {
    conversations: ConversationStore;
    memories: MemoryStore;
    strategy?: ReasoningStrategy;
    summarizer?: ConversationSummarizer;
    signal?: AbortSignal;
    strategies?: ReadonlyMap<string, ReasoningStrategy>;
    productionGraph?: ProductionGraphOptions;
};

async function withSummaryRefreshLock<T>(conversationId: string, operation: () => Promise<T>): Promise<T> {
    const previous = summaryRefreshLocks.get(conversationId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => gate);
    summaryRefreshLocks.set(conversationId, queued);
    await previous;
    try {
        return await operation();
    } finally {
        release();
        if (summaryRefreshLocks.get(conversationId) === queued) summaryRefreshLocks.delete(conversationId);
    }
}

export async function runChat(
    input: ChatServiceInput,
    options: ChatServiceOptions,
) {
    const parsedInput = chatInputSchema.parse(input);
    const conversationId = parsedInput.conversationId ?? options.conversations.create();
    let summaryEvent: Extract<ReasoningResult["trace"][number], { type: "summarize" }> | undefined;

    if (options.conversations.getSummary && options.conversations.saveSummary) {
        await withSummaryRefreshLock(conversationId, async () => {
            const allPriorMessages = options.conversations.lastMessages(conversationId, MAX_HISTORY_LOOKUP);
            const recentMessages = allPriorMessages.slice(-CHAT_HISTORY_LIMIT);
            const existingSummary = options.conversations.getSummary!(conversationId);
            const watermark = existingSummary?.summarizedThroughSequence ?? 0;
            const retiredMessages = allPriorMessages
                .slice(0, Math.max(0, allPriorMessages.length - recentMessages.length));
            const newlyRetiredMessages = retiredMessages.filter(({ sequence }) => sequence > watermark);
            const completeCount = Math.floor(newlyRetiredMessages.length / PRUNING_BATCH_SIZE) * PRUNING_BATCH_SIZE;
            if (completeCount === 0) return;

            const batch = newlyRetiredMessages.slice(0, completeCount);
            const lastSequence = batch.at(-1)?.sequence;
            if (!lastSequence) return;
            try {
                const summarizer = options.summarizer ?? createConversationSummarizer();
                const mergedSummary = (await summarizer.summarize(existingSummary?.summary ?? null, batch)).trim();
                if (!mergedSummary) throw new Error("The summarizer returned an empty summary.");
                const saved = options.conversations.saveSummary!(
                    conversationId,
                    mergedSummary,
                    lastSequence,
                    watermark,
                );
                if (saved) {
                    summaryEvent = {
                        type: "summarize",
                        node: "context",
                        conversationId,
                        summary: mergedSummary,
                        summarizedThroughSequence: lastSequence,
                    };
                }
            } catch (error) {
                if (error instanceof ModelUnavailableError) throw error;
                throw new ConversationSummarizationError(
                    error instanceof Error ? `Conversation summarization failed: ${error.message}` : "Conversation summarization failed.",
                );
            }
        });
    }

    const summary = options.conversations.getSummary?.(conversationId)?.summary ?? null;
    const history = options.conversations.lastMessages(conversationId, CHAT_HISTORY_LIMIT);
    const memories = await options.memories.recall(parsedInput.userId, parsedInput.message);

    options.conversations.append(conversationId, "user", parsedInput.message);
    const memoryOperations = {
        list: () => options.memories.list(parsedInput.userId).map(({ id, fact, createdAt }) => ({ id, fact, createdAt })),
        remember: async (fact: string) => {
            const result = await options.memories.remember(parsedInput.userId, fact);
            return { id: result.memory.id, fact: result.memory.fact, createdAt: result.memory.createdAt };
        },
        forget: async (preference: string) => {
            const candidates = await options.memories.recall(parsedInput.userId, preference, 3);
            if (candidates.length !== 1) {
                return {
                    forgotten: false,
                    needsClarification: true,
                    candidates: candidates.map(({ id, fact }) => ({ id, fact })),
                };
            }
            const candidate = candidates[0]!;
            options.memories.forget(parsedInput.userId, candidate.id);
            return { forgotten: true, needsClarification: false, candidates: [{ id: candidate.id, fact: candidate.fact }] };
        },
    };
    const reasoningInput = {
        request: parsedInput.message,
        summary: summary ?? undefined,
        history: history.map(({ role, content }) => ({ role, content })),
        memories,
        memoryOperations,
        signal: options.signal,
        strategy: parsedInput.strategy,
        reflect: parsedInput.reflect,
    };
    const result = options.strategy
        ? await options.strategy.run(reasoningInput)
        : await runProductionGraph(reasoningInput, {
            ...options.productionGraph,
            strategies: options.strategies ?? options.productionGraph?.strategies,
        });
    const nodeName = options.strategy?.name ?? "react";
    result.trace = result.trace.map((event) => ({ ...event, node: "node" in event ? event.node : nodeName }) as TraceEvent);
    options.conversations.append(conversationId, "assistant", result.answer);

    const breakdown: ContextBreakdown = mergeContextBreakdowns(result.metrics.contextBreakdown);
    if (summary && breakdown.summary === undefined) addContextEstimate(breakdown, "summary", summary);
    if (breakdown.request === undefined) addContextEstimate(breakdown, "request", parsedInput.message);
    if (breakdown.history === undefined) addContextEstimate(breakdown, "history", history.map(({ role, content }) => `${role}: ${content}`).join("\n"));
    if (breakdown.memories === undefined) addContextEstimate(breakdown, "memories", memories.map(({ fact }) => fact).join("\n"));

    return {
        conversationId,
        ...result,
        trace: summaryEvent ? [summaryEvent, ...result.trace] : result.trace,
        metrics: {
            ...result.metrics,
            promptTokens: result.metrics.promptTokens ?? null,
            contextBreakdown: breakdown,
            historyMessages: history.length,
        },
    };
}
