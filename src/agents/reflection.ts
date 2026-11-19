import type { RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { createModel, createStructuredModelRunnable, getModelCandidates } from "./model.js";
import { createRunMetrics } from "./metrics.js";
import { addMemoryContext, type ReasoningInput, type ReasoningResult, type ReasoningStrategy, type TraceEvent } from "./reasoning.js";
import { buildContext } from "../context-builder.js";
import { mergeContextBreakdowns } from "../context/tokens.js";
import { estimateTokens } from "../context/tokens.js";

const critiqueSchema = z.object({
    approved: z.boolean(),
    feedback: z.string().trim().min(1),
});

export type CritiqueDecision = z.infer<typeof critiqueSchema>;

export type ReflectionCriticInput = {
    request: string;
    answer: string;
    observations: unknown[];
    trace: readonly TraceEvent[];
    signal?: AbortSignal;
    callbacks?: RunnableConfig["callbacks"];
};

function withReflectionNode(trace: readonly TraceEvent[]): TraceEvent[] {
    return trace.map((event) => ({ ...event, node: "reflection" }) as TraceEvent);
}

export type ReflectionOptions = {
    maxReflections?: number;
    critic?: (input: ReflectionCriticInput) => Promise<CritiqueDecision>;
    modelFactory?: typeof createModel;
};

function mergeMetrics(base: ReasoningResult["metrics"], extra: ReasoningResult["metrics"]): ReasoningResult["metrics"] {
    const promptTokens = base.promptTokens != null && extra.promptTokens != null
        ? base.promptTokens + extra.promptTokens
        : null;
    return {
        IICalls: base.IICalls + extra.IICalls,
        latencyMs: base.latencyMs + extra.latencyMs,
        ...(extra.modelUsed ?? base.modelUsed ? { modelUsed: extra.modelUsed ?? base.modelUsed } : {}),
        promptTokens,
        contextBreakdown: mergeContextBreakdowns(base.contextBreakdown, extra.contextBreakdown),
    };
}

function buildCritiqueSummary(decision: CritiqueDecision): string {
    return decision.approved
        ? `Approved: ${decision.feedback}`
        : `Rejected: ${decision.feedback}`;
}

function serializeObservation(value: unknown): string {
    if (typeof value === "string") {
        return value;
    }
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

export function withReflection(strategy: ReasoningStrategy, options: ReflectionOptions = {}): ReasoningStrategy {
    const maxReflections = z.number().int().nonnegative().finite().default(2).parse(options.maxReflections ?? 2);
    const modelFactory = options.modelFactory ?? createModel;
    const critic = options.critic ?? (async ({ request, answer, observations, trace, signal, callbacks }) => {
        const criticModel = createStructuredModelRunnable(getModelCandidates(modelFactory), critiqueSchema);
        const response = await criticModel.invoke([{
            role: "user",
            content: `Assess the answer against the original request and the observed tool results. Approve only when the answer is truthful and supported by the trace. If there are gaps or contradictions, mark it as rejected and include concise guidance for regenerating it.\nRequest:\n${request}\n\nAnswer:\n${answer}\n\nObservations:\n${observations.map(serializeObservation).join("\n") || "No tool observations."}\n\nTrace:\n${trace.map(({ type, ...event }) => JSON.stringify({ type, ...event })).join("\n") || "No trace events."}`,
        }], { signal, callbacks });
        return critiqueSchema.parse(response);
    });

    return {
        name: `reflect:${strategy.name}`,
        async run(input: ReasoningInput): Promise<ReasoningResult> {
            const bounded = buildContext({
                message: input.request,
                summary: input.summary,
                history: input.history,
                memories: input.memories,
            });
            const boundedInput: ReasoningInput = {
                ...input,
                request: bounded.message,
                summary: bounded.summary,
                history: bounded.history,
                memories: bounded.memories,
            };
            if (maxReflections === 0) {
                const result = await strategy.run(boundedInput);
                return { ...result, trace: withReflectionNode(result.trace) };
            }

            const initialResult = await strategy.run(boundedInput);
            let currentResult = {
                ...initialResult,
                trace: withReflectionNode(initialResult.trace),
            };
            let critiqueCount = 0;
            const summary = bounded.summary ? `Conversation summary:\n${bounded.summary}` : "";
            const history = bounded.history
                .map(({ role, content }) => `${role}: ${content}`)
                .join("\n");
            const context = [summary, history ? `Conversation history:\n${history}` : ""]
                .filter((section) => section.length > 0)
                .join("\n\n");
            const requestWithMemories = addMemoryContext(bounded.message, bounded.memories);
            let currentRequest = context
                ? `${context}\n\nCurrent request:\n${requestWithMemories}`
                : requestWithMemories;

            for (let cycle = 0; cycle < maxReflections; cycle += 1) {
                const critiqueInput: ReflectionCriticInput = {
                    request: currentRequest,
                    answer: currentResult.answer,
                    observations: currentResult.trace
                        .filter((event) => event.type === "observation")
                        .map((event) => event.result),
                    trace: currentResult.trace,
                    signal: input.signal,
                };

                const criticMetrics = createRunMetrics();
                const decision = critiqueSchema.parse(await critic({
                    ...critiqueInput,
                    callbacks: [criticMetrics.callback],
                }));
                critiqueCount += 1;
                const criticModelUsed = criticMetrics.getMetrics().modelUsed;
                const fallbackEvents = criticMetrics.getFallbackEvents("reflection");
                currentResult = {
                    ...currentResult,
                    trace: [
                        ...withReflectionNode(currentResult.trace),
                        ...fallbackEvents,
                        { type: "critique", node: "reflection", summary: buildCritiqueSummary(decision) },
                    ],
                    metrics: {
                        ...currentResult.metrics,
                        ...(criticModelUsed ? { modelUsed: criticModelUsed } : {}),
                        IICalls: currentResult.metrics.IICalls + 1,
                        contextBreakdown: mergeContextBreakdowns(currentResult.metrics.contextBreakdown, {
                            reflection: estimateTokens(JSON.stringify({
                                request: critiqueInput.request,
                                answer: critiqueInput.answer,
                                observations: critiqueInput.observations,
                                trace: critiqueInput.trace,
                            })),
                        }),
                    },
                };

                if (decision.approved) {
                    return currentResult;
                }

                const regeneratedRequest = `${boundedInput.request}\n\nCritical feedback: ${decision.feedback}`;
                const regenerated = await strategy.run({
                    ...boundedInput,
                    request: regeneratedRequest,
                    maxIterations: boundedInput.maxIterations,
                });

                currentResult = {
                    answer: regenerated.answer,
                    trace: [...currentResult.trace, ...withReflectionNode(regenerated.trace)],
                    metrics: mergeMetrics(currentResult.metrics, regenerated.metrics),
                };

                currentRequest = history
                    ? `Conversation history:\n${history}\n\nCurrent request:\n${regeneratedRequest}`
                    : regeneratedRequest;
                if (cycle === maxReflections - 1) {
                    return currentResult;
                }
            }

            return currentResult;
        },
    };
}

export const critiqueDecisionSchema = critiqueSchema;
