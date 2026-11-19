import type { RunnableConfig } from "@langchain/core/runnables";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { createRunMetrics } from "./metrics.js";
import { createModel, createStructuredModelRunnable, getModelCandidates } from "./model.js";
import { addMemoryContext, type PlanStep, type ReasoningInput, type ReasoningStrategy, type TraceEvent } from "./reasoning.js";
import { buildContext } from "../context-builder.js";
import { createMemoryTools } from "./memory-tools.js";
import { formatTrace } from "./trace.js";
import { createOpsTools } from "./tools.js";
import type { store as defaultStore } from "./store.js";

const planStepSchema = z.discriminatedUnion("tool", [
    z.object({ tool: z.literal("list_alerts"), args: z.object({ status: z.enum(["firing", "resolved", "all"]).default("firing") }) }),
    z.object({ tool: z.literal("open_incident"), args: z.object({ title: z.string().trim().min(1), service: z.string().trim().min(1), severity: z.enum(["sev1", "sev2", "sev3"]) }) }),
    z.object({ tool: z.literal("resolve_incident"), args: z.object({ id: z.string().trim().min(1) }) }),
    z.object({ tool: z.literal("list_incidents"), args: z.object({ status: z.enum(["open", "mitigated", "resolved", "all"]).default("open") }) }),
    z.object({ tool: z.literal("consultar_runbooks"), args: z.object({ service: z.string().trim().min(1) }) }),
    z.object({ tool: z.literal("check_provider_status"), args: z.object({ provider: z.enum(["github", "cloudflare"]).default("github") }) }),
    z.object({ tool: z.literal("list_user_memories"), args: z.object({}) }),
    z.object({ tool: z.literal("remember_user_fact"), args: z.object({ fact: z.string().trim().min(1) }) }),
    z.object({ tool: z.literal("forget_preference"), args: z.object({ preference: z.string().trim().min(1) }) }),
]);

const plannerOutputSchema = z.object({
    steps: z.array(planStepSchema).max(8),
    answer: z.string().default(""),
});

const replannerOutputSchema = z.object({
    steps: z.array(planStepSchema).max(8),
    done: z.boolean(),
    answer: z.string().trim().min(1),
    critique: z.string().trim().min(1),
});

type ReplannerInput = {
    request: string;
    completed: Array<{ tool: string; args: Record<string, unknown>; result: unknown }>;
    remaining: PlanStep[];
};

type Planner = (input: { request: string }, config?: RunnableConfig) => Promise<unknown>;
type Replanner = (input: ReplannerInput, config?: RunnableConfig) => Promise<unknown>;
type OpsStore = typeof defaultStore;
type OpsTool = ReturnType<typeof createOpsTools>[number];
type MemoryTool = ReturnType<typeof createMemoryTools>[number];

type StrategyOptions = {
    planner?: Planner;
    replanner?: Replanner;
    tools?: readonly OpsTool[];
    store?: OpsStore;
    modelFactory?: typeof createModel;
    useReplanner?: boolean;
};

const GraphState = Annotation.Root({
    request: Annotation<string>(),
    iterationLimit: Annotation<number>(),
    steps: Annotation<PlanStep[]>({ default: () => [], reducer: (_current, update) => update }),
    completed: Annotation<Array<{ tool: string; args: Record<string, unknown>; result: unknown }>>({
        default: () => [],
        reducer: (current, update) => [...current, ...update],
    }),
    stepsExecuted: Annotation<number>({ default: () => 0, reducer: (_current, update) => update }),
    done: Annotation<boolean>({ default: () => false, reducer: (_current, update) => update }),
    answer: Annotation<string>({ default: () => "", reducer: (_current, update) => update }),
    trace: Annotation<TraceEvent[]>({ default: () => [], reducer: (current, update) => [...current, ...update] }),
});

function safeJson(value: unknown): string {
    try {
        return JSON.stringify(value) ?? String(value);
    } catch {
        return String(value);
    }
}

function createProductionRunnables(modelFactory: typeof createModel): { planner: Planner; replanner: Replanner } {
    const candidates = getModelCandidates(modelFactory);
    const planner = createStructuredModelRunnable(candidates, plannerOutputSchema);
    const replanner = createStructuredModelRunnable(candidates, replannerOutputSchema);

    return {
        planner: async ({ request }, config) => planner.invoke([{
            role: "user",
            content: `Create a concise operational plan for this request. Use operational tools only when needed. For memory requests, use list_user_memories to inspect the current user's saved facts, remember_user_fact only when explicitly requested, and forget_preference only with the user's description of the target preference. The forget operation is bound to the current user and deletes only when exactly one memory matches; ask the user to clarify if the result says needsClarification or no memory is found. Available tools: list_alerts, open_incident, resolve_incident, list_incidents, consultar_runbooks, check_provider_status, list_user_memories, remember_user_fact, forget_preference. Use check_provider_status when an external dependency may be unavailable and the operator needs to distinguish a provider-side issue from an internal issue; provider is github or cloudflare and defaults to github. Incident severity must be sev1, sev2, or sev3. Open an incident only for an actionable operational condition. Return no more than 8 steps. If no tool action is needed, return an empty plan and a direct answer. Request: ${request}`,
        }], config),
        replanner: async (input, config) => replanner.invoke([{
            role: "user",
            content: `Review the operational request, completed tool results, and remaining plan. Decide whether more steps are needed. For memory requests, use list_user_memories to inspect the current user's saved facts, remember_user_fact only when explicitly requested, and forget_preference only with the user's description of the target preference. The forget operation is bound to the current user and deletes only when exactly one memory matches; ask the user to clarify if the result says needsClarification or no memory is found. Available tools: list_alerts, open_incident, resolve_incident, list_incidents, consultar_runbooks, check_provider_status, list_user_memories, remember_user_fact, forget_preference. Use check_provider_status when an external dependency may be unavailable and the operator needs to distinguish a provider-side issue from an internal issue; provider is github or cloudflare and defaults to github. Return an updated remaining plan of at most 8 steps, a concise critique, and a user-facing answer even if the iteration limit was reached. Do not include private reasoning.\n${safeJson(input)}`,
        }], config),
    };
}

export function createPlanAndExecuteStrategy(options: StrategyOptions = {}): ReasoningStrategy {
    const tools = options.tools ?? createOpsTools(options.store);
    const modelFactory = options.modelFactory ?? createModel;
    const useReplanner = options.useReplanner ?? true;

    return {
        name: "plan-and-execute",
        async run(input: ReasoningInput) {
            const bounded = buildContext({
                message: z.string().trim().min(1).parse(input.request),
                summary: input.summary,
                history: input.history,
                memories: input.memories,
            });
            const currentRequest = addMemoryContext(bounded.message, bounded.memories);
            const summary = bounded.summary ? `Conversation summary:\n${bounded.summary}` : "";
            const history = bounded.history
                .map(({ role, content }) => `${role}: ${content}`)
                .join("\n");
            const context = [summary, history ? `Conversation history:\n${history}` : ""]
                .filter((section) => section.length > 0)
                .join("\n\n");
            const request = context
                ? `${context}\n\nCurrent request:\n${currentRequest}`
                : currentRequest;
            const iterationLimit = z.number().int().min(1).max(8).default(8).parse(input.maxIterations);
            const runMetrics = createRunMetrics();
            runMetrics.addSource("request", currentRequest);
            runMetrics.addSource("history", history);
            runMetrics.addSource("memories", bounded.memories.map(({ fact }) => fact).join("\n"));

            const defaults = options.planner && options.replanner
                ? { planner: options.planner, replanner: options.replanner }
                : createProductionRunnables(modelFactory);
            const planner = options.planner ?? defaults.planner;
            const replanner = options.replanner ?? defaults.replanner;
            const availableTools: Array<OpsTool | MemoryTool> = [
                ...tools,
                ...(input.memoryOperations ? createMemoryTools(input.memoryOperations) : []),
            ];
            const toolsByName = new Map(availableTools.map((candidate) => [
                candidate.name,
                (args: Record<string, unknown>) => (candidate.invoke as (input: Record<string, unknown>) => Promise<unknown>)(args),
            ]));

            const graph = new StateGraph(GraphState)
                .addNode("planner", async (state) => {
                    if (options.planner) runMetrics.callback.recordCall();
                    const result = plannerOutputSchema.parse(await planner({ request: state.request }));
                    const trace: TraceEvent[] = [{ type: "plan", node: "plan-and-execute", steps: result.steps.map(({ tool, args }) => `${tool} ${safeJson(args)}`) }];
                    if (result.steps.length === 0) {
                        return { steps: [], answer: result.answer || "No operational action was required.", done: true, trace };
                    }
                    return { steps: result.steps, answer: result.answer, trace };
                })
                .addNode("executor", async (state) => {
                    const step = state.steps[0];
                    if (!step) {
                        return { done: true };
                    }
                    const selectedTool = toolsByName.get(step.tool);
                    if (!selectedTool) {
                        throw new Error(`Unsupported tool: ${step.tool}`);
                    }
                    let result: unknown;
                    try {
                        result = await selectedTool(step.args);
                    } catch (error) {
                        result = { error: error instanceof Error ? error.message : "Tool execution failed." };
                    }
                    const trace: TraceEvent[] = [
                        { type: "action", node: "plan-and-execute", tool: step.tool, args: step.args },
                        { type: "observation", node: "plan-and-execute", result },
                    ];
                    return {
                        steps: state.steps.slice(1),
                        completed: [{ tool: step.tool, args: step.args, result }],
                        stepsExecuted: state.stepsExecuted + 1,
                        trace,
                    };
                })
                .addNode("replanner", async (state) => {
                    if (options.replanner) runMetrics.callback.recordCall();
                    const result = replannerOutputSchema.parse(await replanner({
                        request: state.request,
                        completed: state.completed,
                        remaining: state.steps,
                    }));
                    const reachedLimit = state.stepsExecuted >= state.iterationLimit;
                    const done = result.done || result.steps.length === 0 || reachedLimit;
                    const trace: TraceEvent[] = [
                        { type: "critique", node: "plan-and-execute", summary: result.critique },
                        ...(done ? [] : [{ type: "plan" as const, node: "plan-and-execute", steps: result.steps.map(({ tool, args }) => `${tool} ${safeJson(args)}`) }]),
                    ];
                    return {
                        steps: result.steps,
                        done,
                        answer: result.answer,
                        trace,
                    };
                })
                .addNode("finalize", async (state) => {
                    const answer = state.answer || "The planned actions were completed.";
                    return { answer, trace: [{ type: "answer" as const, node: "plan-and-execute", text: answer }] };
                })
                .addEdge(START, "planner")
                .addConditionalEdges("planner", (state) => state.done ? "finalize" : "executor", {
                    executor: "executor",
                    finalize: "finalize",
                })
                .addConditionalEdges("executor", (state) => {
                    if (useReplanner) {
                        return "replanner";
                    }
                    return state.steps.length === 0 || state.stepsExecuted >= state.iterationLimit
                        ? "finalize"
                        : "executor";
                }, {
                    executor: "executor",
                    replanner: "replanner",
                    finalize: "finalize",
                })
                .addConditionalEdges("replanner", (state) => state.done ? "finalize" : "executor", {
                    executor: "executor",
                    finalize: "finalize",
                })
                .addEdge("finalize", END)
                .compile();

            const result = await graph.invoke({ request, iterationLimit }, { recursionLimit: 32, signal: input.signal, callbacks: [runMetrics.callback] });
            const trace = [...result.trace];
            const fallbackEvents = runMetrics.getFallbackEvents("plan-and-execute");
            const answerIndex = trace.findIndex((event) => event.type === "answer");
            trace.splice(answerIndex < 0 ? trace.length : answerIndex, 0, ...fallbackEvents);
            for (const observation of result.trace) {
                if (observation.type === "observation") {
                    const text = typeof observation.result === "string"
                        ? observation.result
                        : JSON.stringify(observation.result) ?? String(observation.result);
                    runMetrics.addSource("toolResults", text);
                }
            }
            return {
                answer: result.answer,
                trace,
                metrics: runMetrics.getMetrics(),
            };
        },
    };
}

export const planAndExecuteStrategy = createPlanAndExecuteStrategy();

export function formatPlanAndExecuteResult(result: Awaited<ReturnType<ReasoningStrategy["run"]>>): string {
    return formatTrace(result.trace);
}