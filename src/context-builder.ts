import { z } from "zod";
import { estimateTokens } from "./context/tokens.js";
import type { ReasoningHistoryMessage } from "./agents/reasoning.js";

const positiveBudgetSchema = z.number().int().positive().finite();

export class ContextBudgetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ContextBudgetError";
    }
}

export type ContextMemory = { fact: string; score: number };
export type ContextBudgets = { summary: number; history: number; memories: number };

export type BuildContextInput = {
    system?: string;
    message: string;
    summary?: string;
    history?: readonly ReasoningHistoryMessage[];
    memories?: readonly ContextMemory[];
    environment?: NodeJS.ProcessEnv;
};

export type BuildContext = {
    system: string;
    message: string;
    summary?: string;
    history: readonly ReasoningHistoryMessage[];
    memories: readonly ContextMemory[];
    budgets: ContextBudgets;
    breakdown: { system: number; message: number; summary?: number; history?: number; memories?: number };
};

const DEFAULT_BUDGETS = { summary: 100, history: 300, memories: 100 } as const;

function readBudget(environment: NodeJS.ProcessEnv | undefined, name: string, fallback: number): number {
    const raw = environment?.[name];
    if (raw === undefined || raw.trim().length === 0) return fallback;
    const parsed = Number(raw);
    try {
        return positiveBudgetSchema.parse(parsed);
    } catch {
        throw new ContextBudgetError(`${name} must be a positive integer; received ${JSON.stringify(raw)}`);
    }
}

export function resolveContextBudgets(environment: NodeJS.ProcessEnv = process.env): ContextBudgets {
    return {
        summary: readBudget(environment, "CONTEXT_BUDGET_SUMMARY", DEFAULT_BUDGETS.summary),
        history: readBudget(environment, "CONTEXT_BUDGET_HISTORY", DEFAULT_BUDGETS.history),
        memories: readBudget(environment, "CONTEXT_BUDGET_MEMORIES", DEFAULT_BUDGETS.memories),
    };
}

function fitSummary(summary: string | undefined, budget: number): string | undefined {
    if (!summary) return summary;
    if (estimateTokens(summary) <= budget) return summary;
    const prefixLength = Math.min(summary.length, budget * 4);
    const prefix = summary.slice(0, prefixLength);
    let candidate = prefix;
    while (candidate.length > 0 && estimateTokens(candidate) > budget) candidate = candidate.slice(0, -1);
    return candidate;
}

function formatHistory(history: readonly ReasoningHistoryMessage[]): string {
    return history.map(({ role, content }) => `${role}: ${content}`).join("\n");
}

function fitHistory(history: readonly ReasoningHistoryMessage[], budget: number): readonly ReasoningHistoryMessage[] {
    const retained = [...history];
    while (retained.length > 0 && estimateTokens(formatHistory(retained)) > budget) retained.shift();
    return retained;
}

function formatMemories(memories: readonly ContextMemory[]): string {
    return memories.map(({ fact }) => `- ${fact}`).join("\n");
}

function fitMemories(memories: readonly ContextMemory[], budget: number): readonly ContextMemory[] {
    const survivors = [...memories];
    const removalOrder = memories
        .map((memory, index) => ({ memory, index }))
        .sort((left, right) => left.memory.score - right.memory.score || left.index - right.index);

    for (const { memory } of removalOrder) {
        if (estimateTokens(formatMemories(survivors)) <= budget) break;
        const index = survivors.indexOf(memory);
        if (index >= 0) survivors.splice(index, 1);
    }
    return survivors;
}

export function buildContext(input: BuildContextInput): BuildContext {
    const message = z.string().min(1).parse(input.message);
    const budgets = resolveContextBudgets(input.environment);
    const summary = fitSummary(input.summary, budgets.summary);
    const history = fitHistory(input.history ?? [], budgets.history);
    const memories = fitMemories(input.memories ?? [], budgets.memories);

    return {
        system: input.system ?? "",
        message,
        summary,
        history,
        memories,
        budgets,
        breakdown: {
            system: estimateTokens(input.system ?? ""),
            message: estimateTokens(message),
            summary: summary ? estimateTokens(summary) : undefined,
            history: history.length > 0 ? estimateTokens(formatHistory(history)) : undefined,
            memories: memories.length > 0 ? estimateTokens(formatMemories(memories)) : undefined,
        },
    };
}
