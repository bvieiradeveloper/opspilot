import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { LLMResult } from "@langchain/core/outputs";
import { addContextEstimate, type ContextBreakdown, type ContextSource } from "../context/tokens.js";
import type { Metrics, TraceEvent } from "./reasoning.js";

function usableInputCount(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0
        ? value
        : undefined;
}

function usableCost(value: unknown): number | undefined {
    return typeof value === "number" && Number.isFinite(value) && value >= 0
        ? value
        : undefined;
}

function findProviderCost(value: unknown, insideUsage = false): number | undefined {
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    if (insideUsage) {
        const cost = usableCost(record.cost);
        if (cost !== undefined) return cost;
    }
    for (const [key, nested] of Object.entries(record)) {
        if (Array.isArray(nested) || (nested && typeof nested === "object")) {
            const found = findProviderCost(
                nested,
                insideUsage || ["usage", "usage_metadata", "usageMetadata", "token_usage", "tokenUsage"].includes(key),
            );
            if (found !== undefined) return found;
        }
    }
    return undefined;
}

function findInputTokens(value: unknown): number | undefined {
    if (!value || typeof value !== "object") return undefined;
    const record = value as Record<string, unknown>;
    const usageMetadata = record.usage_metadata ?? record.usageMetadata;
    if (usageMetadata && typeof usageMetadata === "object") {
        const found = usableInputCount((usageMetadata as Record<string, unknown>).input_tokens);
        if (found !== undefined) return found;
    }
    const responseMetadata = record.response_metadata ?? record.responseMetadata;
    if (responseMetadata && typeof responseMetadata === "object") {
        const tokenUsage = (responseMetadata as Record<string, unknown>).token_usage ?? (responseMetadata as Record<string, unknown>).tokenUsage;
        if (tokenUsage && typeof tokenUsage === "object") {
            const usage = tokenUsage as Record<string, unknown>;
            const found = usableInputCount(usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? usage.inputTokens);
            if (found !== undefined) return found;
        }
    }
    const llmOutput = record.llmOutput ?? record.llm_output;
    if (llmOutput && typeof llmOutput === "object") {
        const output = llmOutput as Record<string, unknown>;
        const tokenUsage = output.tokenUsage ?? output.token_usage ?? output.usage;
        if (tokenUsage && typeof tokenUsage === "object") {
            const usage = tokenUsage as Record<string, unknown>;
            const found = usableInputCount(usage.promptTokens ?? usage.prompt_tokens ?? usage.inputTokens ?? usage.input_tokens);
            if (found !== undefined) return found;
        }
    }
    for (const [key, nested] of Object.entries(record)) {
        if (key === "usage_metadata" || key === "usageMetadata") continue;
        if (Array.isArray(nested) || (nested && typeof nested === "object")) {
            const found = findInputTokens(nested);
            if (found !== undefined) return found;
        }
    }
    return undefined;
}

class RunMetricsCallback extends BaseCallbackHandler {
    name = "ops-pilot-run-metrics";
    calls = 0;
    modelEndsObserved = 0;
    totalPromptTokens = 0;
    usageComplete = true;
    totalProviderCost = 0;
    costComplete = true;
    breakdown: ContextBreakdown = {};
    modelUsed: string | undefined;
    private readonly modelByRun = new Map<string, { modelId: string; role: string; primaryModelId?: string }>();
    private readonly fallbackUses: Array<{ from: string; to: string }> = [];

    handleChatModelStart(...args: Parameters<NonNullable<BaseCallbackHandler["handleChatModelStart"]>>): void {
        const [, , runId, , , , metadata] = args;
        const modelId = metadata?.opsPilotModelId;
        if (typeof modelId === "string") {
            this.recordModelStart(
                runId,
                modelId,
                typeof metadata?.opsPilotModelRole === "string" ? metadata.opsPilotModelRole : "primary",
                typeof metadata?.opsPilotPrimaryModelId === "string" ? metadata.opsPilotPrimaryModelId : undefined,
            );
        } else {
            this.recordCall();
        }
    }

    handleLLMEnd(...args: Parameters<NonNullable<BaseCallbackHandler["handleLLMEnd"]>>): void {
        const [output, runId] = args;
        this.modelEndsObserved += 1;
        const inputTokens = findInputTokens(output);
        if (inputTokens === undefined) this.usageComplete = false;
        else this.totalPromptTokens += inputTokens;
        const providerCost = findProviderCost(output);
        if (providerCost === undefined) this.costComplete = false;
        else this.totalProviderCost += providerCost;
        this.recordModelSuccess(runId);
    }

    handleLLMError(...args: Parameters<NonNullable<BaseCallbackHandler["handleLLMError"]>>): void {
        this.modelByRun.delete(args[1]);
    }
    recordUsage(output: unknown): void {
        this.modelEndsObserved += 1;
        const inputTokens = findInputTokens(output);
        if (inputTokens === undefined) this.usageComplete = false;
        else this.totalPromptTokens += inputTokens;
        const providerCost = findProviderCost(output);
        if (providerCost === undefined) this.costComplete = false;
        else this.totalProviderCost += providerCost;
    }
    recordCall(): void { this.calls += 1; }
    recordModelStart(runId: string, modelId: string, role = "primary", primaryModelId?: string): void {
        this.calls += 1;
        this.modelByRun.set(runId, { modelId, role, primaryModelId });
    }
    recordModelSuccess(runId: string): void {
        const model = this.modelByRun.get(runId);
        if (model) {
            this.modelUsed = model.modelId;
            if (model.role === "fallback" && model.primaryModelId) {
                this.fallbackUses.push({ from: model.primaryModelId, to: model.modelId });
            }
        }
        this.modelByRun.delete(runId);
    }
    addSource(source: ContextSource, text: string): void { addContextEstimate(this.breakdown, source, text); }
    getFallbackEvents(node: string): TraceEvent[] {
        return this.fallbackUses.map(({ from, to }) => ({ type: "fallback", node, from, to }));
    }
}

export function createRunMetrics() {
    const callback = new RunMetricsCallback();
    const startedAt = performance.now();
    return {
        callback,
        addSource(source: ContextSource, text: string): void { callback.addSource(source, text); },
        recordUsage(output: unknown): void { callback.recordUsage(output); },
        getFallbackEvents(node: string): TraceEvent[] {
            return callback.getFallbackEvents(node);
        },
        getMetrics(): Metrics {
            return {
                IICalls: callback.calls,
                latencyMs: Math.max(0, performance.now() - startedAt),
                ...(callback.modelUsed ? { modelUsed: callback.modelUsed } : {}),
                promptTokens: callback.modelEndsObserved > 0 && callback.usageComplete ? callback.totalPromptTokens : null,
                providerCost: callback.modelEndsObserved > 0 && callback.costComplete ? callback.totalProviderCost : null,
                contextBreakdown: { ...callback.breakdown },
            };
        },
    };
}