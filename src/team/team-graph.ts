import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import { createRunMetrics } from "../agents/metrics.js";
import type { ReasoningInput, ReasoningResult, ReasoningStrategy, TraceEvent } from "../agents/reasoning.js";
import {
    incidentBlackboardSchema,
    supervisorDecisionSchema,
    teamRunStateSchema,
    type IncidentBlackboard,
    type SupervisorDecision,
    type TeamRole,
    type TeamRoleResult,
    type TeamRunState,
    type SupervisorNext,
} from "./types.js";

export type TeamRoleInput = {
    request: string;
    brief: string;
    blackboard: IncidentBlackboard;
};

export type TeamRoleRunner = (
    input: TeamRoleInput,
    config?: RunnableConfig,
) => Promise<TeamRoleResult>;

export type TeamRoleRunners = Record<TeamRole, TeamRoleRunner>;
export type TeamSupervisor = (
    state: TeamRunState,
    config?: RunnableConfig,
) => Promise<SupervisorDecision>;

export type TeamStrategyOptions = {
    supervisor: TeamSupervisor;
    roles: TeamRoleRunners;
};

const TeamGraphState = Annotation.Root({
    input: Annotation<ReasoningInput>(),
    team: Annotation<TeamRunState>({ reducer: (_current, update) => update }),
    next: Annotation<SupervisorNext>({ reducer: (_current, update) => update }),
    brief: Annotation<string>({ reducer: (_current, update) => update }),
    trace: Annotation<TraceEvent[]>({ default: () => [], reducer: (current, update) => [...current, ...update] }),
    answer: Annotation<string>({ default: () => "", reducer: (_current, update) => update }),
});

function updateBlackboard(
    blackboard: IncidentBlackboard,
    result: TeamRoleResult,
    role: TeamRole,
): IncidentBlackboard {
    const update: IncidentBlackboard = {
        ...blackboard,
        findings: role === "analyst" ? [...blackboard.findings, ...(result.findings ?? [])] : blackboard.findings,
        plan: role === "planner" ? [...blackboard.plan, ...(result.plan ?? [])] : blackboard.plan,
        executionResults: role === "executor"
            ? [...blackboard.executionResults, ...(result.executionResults ?? [])]
            : blackboard.executionResults,
        openQuestions: role === "executor"
            ? blackboard.openQuestions
            : [...blackboard.openQuestions, ...(result.openQuestions ?? [])],
    };
    return incidentBlackboardSchema.parse(update);
}

function completedWork(blackboard: IncidentBlackboard): string {
    const work = [
        ...blackboard.findings,
        ...blackboard.executionResults
            .filter(({ status }) => status === "completed")
            .map(({ summary }) => summary),
    ];
    return work.length > 0 ? work.join("; ") : "No incident work was completed.";
}

function incompleteWork(blackboard: IncidentBlackboard): string {
    const completedTools = new Set(blackboard.executionResults
        .filter(({ status }) => status === "completed")
        .map(({ tool }) => tool));
    const pending = blackboard.plan.filter((step) => ![...completedTools].some((tool) => step.includes(tool)));
    const unresolvedOperations = blackboard.executionResults
        .filter(({ status }) => status !== "completed")
        .map(({ summary }) => summary);
    const incomplete = [...pending, ...unresolvedOperations, ...blackboard.openQuestions];
    if (incomplete.length > 0) return incomplete.join("; ");
    return "None reported.";
}

function finalAnswer(state: typeof TeamGraphState.State): string {
    if (state.team.outcome === "handoff_limit") {
        return `Team coordination stopped after eight handoffs. Completed: ${completedWork(state.team.blackboard)} Incomplete: ${incompleteWork(state.team.blackboard)}`;
    }
    if (state.team.outcome === "blocked") {
        return `Team coordination stopped because an incident operation was blocked. Completed: ${completedWork(state.team.blackboard)} Incomplete: ${incompleteWork(state.team.blackboard)}`;
    }
    return state.team.answer || "The team completed its incident response.";
}

export function createTeamStrategy(options: TeamStrategyOptions): ReasoningStrategy {
    const graph = new StateGraph(TeamGraphState)
        .addNode("supervisor", async (state, config) => {
            const decision = supervisorDecisionSchema.parse(await options.supervisor(state.team, config));
            if (decision.next === "done" || decision.next === "out_of_scope") {
                const outcome = decision.next === "done" ? "completed" : "out_of_scope";
                const team = teamRunStateSchema.parse({
                    ...state.team,
                    answer: decision.brief,
                    outcome,
                });
                return { team, next: decision.next, brief: decision.brief, answer: decision.brief, trace: [] };
            }

            const role = decision.next as TeamRole;
            const handoff: TraceEvent = {
                type: "handoff",
                node: "team",
                from: state.team.currentRole ?? "supervisor",
                to: role,
                brief: decision.brief,
            };
            const team = teamRunStateSchema.parse({
                ...state.team,
                currentRole: role,
                handoffCount: state.team.handoffCount + 1,
            });
            return { team, next: role, brief: decision.brief, trace: [handoff] };
        })
        .addNode("analyst", async (state, config) => {
            const result = await options.roles.analyst({
                request: state.input.request,
                brief: state.brief,
                blackboard: state.team.blackboard,
            }, config);
            const blackboard = updateBlackboard(state.team.blackboard, result, "analyst");
            const outcome = state.team.handoffCount >= 8 ? "handoff_limit" : state.team.outcome;
            const team = teamRunStateSchema.parse({ ...state.team, blackboard, outcome });
            return { team, trace: result.trace ?? [] };
        })
        .addNode("planner", async (state, config) => {
            const result = await options.roles.planner({
                request: state.input.request,
                brief: state.brief,
                blackboard: state.team.blackboard,
            }, config);
            const blackboard = updateBlackboard(state.team.blackboard, result, "planner");
            const outcome = state.team.handoffCount >= 8 ? "handoff_limit" : state.team.outcome;
            const team = teamRunStateSchema.parse({ ...state.team, blackboard, outcome });
            return { team, trace: result.trace ?? [] };
        })
        .addNode("executor", async (state, config) => {
            const result = await options.roles.executor({
                request: state.input.request,
                brief: state.brief,
                blackboard: state.team.blackboard,
            }, config);
            const blackboard = updateBlackboard(state.team.blackboard, result, "executor");
            const blocked = result.executionResults?.some(({ status }) => status === "blocked") ?? false;
            const team = teamRunStateSchema.parse({
                ...state.team,
                blackboard,
                outcome: blocked ? "blocked" : state.team.handoffCount >= 8 ? "handoff_limit" : state.team.outcome,
            });
            return { team, trace: result.trace ?? [] };
        })
        .addNode("finish", async (state) => ({ answer: finalAnswer(state) }))
        .addEdge(START, "supervisor")
        .addConditionalEdges("supervisor", (state) => state.next, {
            analyst: "analyst",
            planner: "planner",
            executor: "executor",
            done: "finish",
            out_of_scope: "finish",
        })
        .addConditionalEdges("analyst", (state) =>
            state.team.handoffCount >= 8 || state.team.outcome === "blocked" ? "finish" : "supervisor", {
            supervisor: "supervisor",
            finish: "finish",
        })
        .addConditionalEdges("planner", (state) =>
            state.team.handoffCount >= 8 || state.team.outcome === "blocked" ? "finish" : "supervisor", {
            supervisor: "supervisor",
            finish: "finish",
        })
        .addConditionalEdges("executor", (state) =>
            state.team.handoffCount >= 8 || state.team.outcome === "blocked" ? "finish" : "supervisor", {
            supervisor: "supervisor",
            finish: "finish",
        })
        .addEdge("finish", END)
        .compile();

    return {
        name: "team",
        async run(input): Promise<ReasoningResult> {
            const runMetrics = createRunMetrics();
            runMetrics.addSource("request", input.request);
            if (input.summary) runMetrics.addSource("summary", input.summary);
            runMetrics.addSource("history", (input.history ?? []).map(({ role, content }) => `${role}: ${content}`).join("\n"));
            runMetrics.addSource("memories", (input.memories ?? []).map(({ fact }) => fact).join("\n"));

            const initialState = {
                input,
                team: teamRunStateSchema.parse({
                    request: input.request,
                    currentRole: null,
                    handoffCount: 0,
                    blackboard: incidentBlackboardSchema.parse({ request: input.request }),
                    answer: "",
                    outcome: "running",
                }),
                next: "analyst" as const,
                brief: "",
            };
            const result = await graph.invoke(initialState, {
                recursionLimit: 32,
                signal: input.signal,
                callbacks: [runMetrics.callback],
            });
            const answer = result.answer || finalAnswer(result);
            const answerEvent: TraceEvent = { type: "answer", node: "team", text: answer };
            return {
                answer,
                trace: [...result.trace, answerEvent, ...runMetrics.getFallbackEvents("team")],
                metrics: runMetrics.getMetrics(),
            };
        },
    };
}

export { finalAnswer, updateBlackboard };
