import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { createModel, createStructuredModelRunnable, getModelCandidates } from "../agents/model.js";
import { supervisorDecisionSchema, type SupervisorDecision, type TeamRunState } from "./types.js";

const SUPERVISOR_PROMPT = `You are the incident-response supervisor. Select the next role using the shared blackboard and the incident request.
Available next values:
- analyst: collect factual incident evidence using read-only tools; never recommend or mutate.
- planner: produce a concise incident response plan; this role has no tools.
- executor: perform only permitted incident operations through approval-aware tools.
- done: finish the incident response and put the concise user-facing summary in brief.
- out_of_scope: reject requests that are not incident-response work and explain the supported scope in brief.
Choose only a necessary next step, do not repeat completed work, and do not bypass role permissions or approvals.
Return a concise work instruction in brief for a role, or a concise final summary for done/out_of_scope. Do not include private reasoning.`;

export type TeamSupervisor = (
    state: TeamRunState,
    config?: RunnableConfig,
) => Promise<SupervisorDecision>;

export function createTeamSupervisor(modelFactory: typeof createModel = createModel): TeamSupervisor {
    const runnable = createStructuredModelRunnable(
        getModelCandidates(modelFactory),
        supervisorDecisionSchema,
    );

    return async (state, config) => {
        const result = await runnable.invoke([
            new SystemMessage(SUPERVISOR_PROMPT),
            new HumanMessage(JSON.stringify({
                request: state.request,
                currentRole: state.currentRole,
                handoffCount: state.handoffCount,
                blackboard: state.blackboard,
            })),
        ], config);
        return supervisorDecisionSchema.parse(result);
    };
}

export { SUPERVISOR_PROMPT };
