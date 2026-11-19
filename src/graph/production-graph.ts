import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { buildContext } from "../context-builder.js";
import { mergeContextBreakdowns } from "../context/tokens.js";
import { UnknownStrategyError } from "../agents/errors.js";
import { ModelUnavailableError } from "../agents/errors.js";
import { createModel, createStructuredModelRunnable, getModelCandidates } from "../agents/model.js";
import { createRunMetrics } from "../agents/metrics.js";
import { createReactStrategy } from "../agents/react.js";
import { createPlanAndExecuteStrategy } from "../agents/plan-and-execute.js";
import { withReflection, type ReflectionOptions } from "../agents/reflection.js";
import type { Metrics, ReasoningInput, ReasoningResult, ReasoningStrategy, SupportedRoute, TraceEvent } from "../agents/reasoning.js";

export const supportedRoutes = ["react", "plan-and-execute", "reflect:react"] as const;
export const routeDecisionSchema = z.object({
    route: z.enum(["react", "plan-and-execute", "reflect:react"]),
    reason: z.string().trim().min(1),
});
export type RoutingDecision = z.infer<typeof routeDecisionSchema>;

export type ProductionGraphInput = ReasoningInput & {
    userId?: string;
    conversationId?: string;
    strategy?: SupportedRoute;
    reflect?: boolean;
};
export type ProductionGraphOptions = {
    strategies?: ReadonlyMap<string, ReasoningStrategy>;
    modelFactory?: typeof createModel;
    reflectionOptions?: ReflectionOptions;
};

const GraphState = Annotation.Root({
    input: Annotation<ProductionGraphInput>(),
    preparedContext: Annotation<ReturnType<typeof buildContext>>(),
    routing: Annotation<RoutingDecision & { node: "router" }>(),
    selectedStrategy: Annotation<SupportedRoute>(),
    trace: Annotation<TraceEvent[]>({ default: () => [], reducer: (current, update) => [...current, ...update] }),
    answer: Annotation<string>({ default: () => "", reducer: (_current, update) => update }),
    metrics: Annotation<Metrics>({ default: () => ({ IICalls: 0, latencyMs: 0 }), reducer: (_current, update) => update }),
});

function normalizeTrace(trace: readonly TraceEvent[], node: "react" | "plan-and-execute" | "reflection"): TraceEvent[] {
    return trace.map((event) => ({ ...event, node } as TraceEvent));
}

async function executeStrategy(
    state: typeof GraphState.State,
    route: SupportedRoute,
    node: "react" | "plan-and-execute" | "reflection",
    strategies: ReadonlyMap<string, ReasoningStrategy>,
    options: ProductionGraphOptions,
) {
    let strategy: ReasoningStrategy | undefined;
    if (route === "reflect:react") {
        const react = strategies.get("react");
        strategy = react ? withReflection(react, options.reflectionOptions) : undefined;
    } else {
        strategy = strategies.get(route);
        if (!strategy && route === "react" && strategies.size > 0) {
            strategy = strategies.values().next().value;
        }
    }
    if (!strategy) throw new UnknownStrategyError(`Unknown strategy: ${route}`);
    const context = state.preparedContext;
    const result: ReasoningResult = await strategy.run({
        ...state.input,
        request: context.message,
        summary: context.summary,
        history: context.history,
        memories: context.memories,
    });
    return {
        answer: result.answer,
        trace: normalizeTrace(result.trace, node),
        metrics: {
            ...result.metrics,
            contextBreakdown: mergeContextBreakdowns(context.breakdown, result.metrics.contextBreakdown),
        } satisfies Metrics,
    };
}

export function createProductionGraph(options: ProductionGraphOptions = {}) {
    const strategies = options.strategies ?? new Map<string, ReasoningStrategy>([
        ["react", createReactStrategy()],
        ["plan-and-execute", createPlanAndExecuteStrategy()],
    ]);
    const modelFactory = options.modelFactory ?? createModel;
    const graph = new StateGraph(GraphState)
        .addNode("context", async (state) => ({
            preparedContext: buildContext({
                message: state.input.request,
                summary: state.input.summary,
                history: state.input.history,
                memories: state.input.memories,
            }),
        }))
        .addNode("router", async (state) => {
            const override = state.input.strategy ?? (state.input.reflect ? "reflect:react" as const : undefined);
            if (override) {
                if (!supportedRoutes.includes(override)) throw new UnknownStrategyError(`Unknown strategy: ${override}`);
                const routeEvent: TraceEvent = { type: "route", node: "router", route: override, reason: "Explicit strategy override." };
                return { routing: { node: "router" as const, route: override, reason: "Explicit strategy override." }, selectedStrategy: override, trace: [routeEvent] };
            }
            let decision: RoutingDecision;
            const routerMetrics = createRunMetrics();
            try {
                const router = createStructuredModelRunnable(getModelCandidates(modelFactory), routeDecisionSchema);
                const response = await router.invoke([{
                    role: "user",
                    content: `Select exactly one operational strategy. react: iterative tool use and direct operational lookups. plan-and-execute: multi-step work requiring planning, actions, replanning, and completion. reflect:react: ReAct execution followed by critique and optional regeneration. Return route and concise reason.\nRequest: ${state.preparedContext.message}\nSummary: ${state.preparedContext.summary ?? "none"}\nHistory: ${state.preparedContext.history.map(({ role, content }) => `${role}: ${content}`).join("\n") || "none"}\nMemories: ${state.preparedContext.memories.map(({ fact }) => fact).join("\n") || "none"}`,
                }], { signal: state.input.signal, callbacks: [routerMetrics.callback] });
                decision = routeDecisionSchema.parse(response);
            } catch (error) {
                if (error instanceof ModelUnavailableError) throw error;
                decision = { route: "react", reason: "Automatic routing was unavailable; defaulted to react." };
            }
            const routeEvent: TraceEvent = { type: "route", node: "router", ...decision };
            return {
                routing: { node: "router" as const, ...decision },
                selectedStrategy: decision.route,
                trace: [...routerMetrics.getFallbackEvents("router"), routeEvent],
            };
        })
        .addNode("react", async (state) => executeStrategy(state, "react", "react", strategies, options))
        .addNode("plan-and-execute", async (state) => executeStrategy(state, "plan-and-execute", "plan-and-execute", strategies, options))
        .addNode("reflection", async (state) => executeStrategy(state, "reflect:react", "reflection", strategies, options))
        .addNode("response", async (state) => ({ answer: state.answer, trace: [], metrics: state.metrics }))
        .addEdge(START, "context")
        .addEdge("context", "router")
        .addConditionalEdges("router", (state) => state.selectedStrategy === "react" ? "react" : state.selectedStrategy === "plan-and-execute" ? "plan-and-execute" : "reflection", {
            react: "react", "plan-and-execute": "plan-and-execute", reflection: "reflection",
        })
        .addEdge("react", "response")
        .addEdge("plan-and-execute", "response")
        .addEdge("reflection", "response")
        .addEdge("response", END);
    return graph.compile();
}

export async function runProductionGraph(input: ProductionGraphInput, options: ProductionGraphOptions = {}): Promise<ReasoningResult> {
    const graph = createProductionGraph(options);
    const result = await graph.invoke({ input } as typeof GraphState.State);
    return { answer: result.answer, trace: result.trace, metrics: result.metrics };
}

export const productionGraph = createProductionGraph;
