import { tool } from "@langchain/core/tools";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage, type BaseMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { z } from "zod";
import { createRunMetrics } from "./metrics.js";
import { createModel, getModelCandidates } from "./model.js";
import { addMemoryContext, type ReasoningInput, type ReasoningStrategy, type ToolName, type TraceEvent } from "./reasoning.js";
import { buildContext } from "../context-builder.js";
import { createMemoryTools } from "./memory-tools.js";
import { createOpsTools } from "./tools.js";
import type { store as defaultStore } from "./store.js";

type OpsStore = typeof defaultStore;
type OpsTool = ReturnType<typeof createOpsTools>[number];
type MemoryTool = ReturnType<typeof createMemoryTools>[number];

function messageText(content: BaseMessage["content"]): string {
    if (typeof content === "string") {
        return content;
    }
    return content
        .map((block) => "text" in block && typeof block.text === "string" ? block.text : "")
        .filter(Boolean)
        .join("\n");
}

export function messagesToTrace(messages: readonly BaseMessage[]): TraceEvent[] {
    const trace: TraceEvent[] = [];
    const lastAssistantMessage = [...messages].reverse().find((message) => AIMessage.isInstance(message));
    const finalAssistantMessage = lastAssistantMessage && AIMessage.isInstance(lastAssistantMessage)
        && (lastAssistantMessage.tool_calls?.length ?? 0) === 0
        ? lastAssistantMessage
        : undefined;

    for (const message of messages) {
        if (AIMessage.isInstance(message)) {
            for (const call of message.tool_calls ?? []) {
                trace.push({
                    type: "action",
                    node: "react",
                    tool: call.name as ToolName,
                    args: call.args,
                });
            }
        } else if (ToolMessage.isInstance(message)) {
            trace.push({ type: "observation", node: "react", result: messageText(message.content) });
        }
    }

    if (finalAssistantMessage && AIMessage.isInstance(finalAssistantMessage)) {
        trace.push({ type: "answer", node: "react", text: messageText(finalAssistantMessage.content) });
    }
    return trace;
}

function createBoundedTools(tools: readonly (OpsTool | MemoryTool)[], maxActions: number) {
    let actionsExecuted = 0;
    const boundedTools = tools.map((originalTool) => tool(
        async (args: Record<string, unknown>) => {
            if (actionsExecuted >= maxActions) {
                return JSON.stringify({ error: "Maximum action limit reached." });
            }
            actionsExecuted += 1;
            return (originalTool.invoke as (input: Record<string, unknown>) => Promise<unknown>)(args);
        },
        {
            name: originalTool.name,
            description: originalTool.description,
            schema: originalTool.schema as z.ZodObject<z.ZodRawShape>,
        },
    ));
    return { boundedTools, getActionsExecuted: () => actionsExecuted };
}

export type ReactStrategyOptions = {
    tools?: readonly OpsTool[];
    store?: OpsStore;
    modelFactory?: typeof createModel;
};

export function createReactStrategy(options: ReactStrategyOptions = {}): ReasoningStrategy {
    return {
        name: "react",
        async run(input: ReasoningInput) {
            const request = z.string().trim().min(1).parse(input.request);
            const maxIterations = z.number().int().min(1).max(8).default(8).parse(input.maxIterations);
            const bounded = buildContext({
                message: request,
                summary: input.summary,
                history: input.history,
                memories: input.memories,
            });
            const runMetrics = createRunMetrics();
            runMetrics.addSource("request", bounded.message);
            if (bounded.summary) runMetrics.addSource("summary", bounded.summary);
            runMetrics.addSource("history", bounded.history.map(({ role, content }) => `${role}: ${content}`).join("\n"));
            runMetrics.addSource("memories", bounded.memories.map(({ fact }) => fact).join("\n"));
            const sourceTools = [
                ...(options.tools ?? createOpsTools(options.store)),
                ...(input.memoryOperations ? createMemoryTools(input.memoryOperations) : []),
            ];
            const { boundedTools } = createBoundedTools(sourceTools, maxIterations);
            const agent = createReactAgent({
                llm: getModelCandidates(options.modelFactory ?? createModel).primary,
                tools: boundedTools,
            });
            const conversationMessages = [
                ...(bounded.summary ? [new SystemMessage(`Conversation summary:\n${bounded.summary}`)] : []),
                ...bounded.history.map(({ role, content }) => role === "user"
                    ? new HumanMessage(content)
                    : new AIMessage(content)),
                new HumanMessage(addMemoryContext(bounded.message, bounded.memories)),
            ];
            const result = await agent.invoke(
                { messages: conversationMessages },
                { recursionLimit: maxIterations * 4 + 2, callbacks: [runMetrics.callback], signal: input.signal },
            );
            const messages = result.messages as BaseMessage[];
            const lastAssistantMessage = [...messages].reverse().find((message) => AIMessage.isInstance(message));
            const finalMessage = lastAssistantMessage && AIMessage.isInstance(lastAssistantMessage)
                && (lastAssistantMessage.tool_calls?.length ?? 0) === 0
                ? lastAssistantMessage
                : undefined;
            const answer = finalMessage
                ? messageText(finalMessage.content)
                : "The strategy stopped before producing a final answer.";
            const trace = messagesToTrace(messages);
            const fallbackEvents = runMetrics.getFallbackEvents("react");
            const answerIndex = trace.findIndex((event) => event.type === "answer");
            trace.splice(answerIndex < 0 ? trace.length : answerIndex, 0, ...fallbackEvents);
            if (trace.at(-1)?.type !== "answer") {
                trace.push({ type: "answer", node: "react", text: answer });
            }
            for (const event of trace) {
                if (event.type === "observation") {
                    const text = typeof event.result === "string"
                        ? event.result
                        : JSON.stringify(event.result) ?? String(event.result);
                    runMetrics.addSource("toolResults", text);
                }
            }
            return {
                answer,
                trace,
                metrics: {
                    ...runMetrics.getMetrics(),
                },
            };
        },
    };
}

export const reactStrategy = createReactStrategy();