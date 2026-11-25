import { createPlanAndExecuteStrategy } from "./plan-and-execute.js";
import type { ReasoningStrategy } from "./reasoning.js";
import { createReactStrategy } from "./react.js";
import type { OpsStore } from "../store/ops-store.js";
import { store as defaultStore } from "./store.js";
import { createApprovalAwareTools } from "./approval-tools.js";
import type { IncidentProposal } from "../services/approval-service.js";
import { createWarRoomTeamStrategy } from "../team/index.js";
import type { createModel } from "./model.js";

export function createStrategyRegistry(store: OpsStore = defaultStore): ReadonlyMap<string, ReasoningStrategy> {
    const react = createReactStrategy({ store });
    const planAndExecute = createPlanAndExecuteStrategy({ store });
    return new Map([
        [react.name, react],
        [planAndExecute.name, planAndExecute],
    ]);
}

export function createWarRoomStrategyRegistry(
    store: OpsStore,
    onProposal: (proposal: IncidentProposal) => void,
    modelFactory?: typeof createModel,
): ReadonlyMap<string, ReasoningStrategy> {
    const tools = createApprovalAwareTools(store, onProposal);
    const react = createReactStrategy({ store, tools });
    const planAndExecute = createPlanAndExecuteStrategy({ store, tools });
    const team = createWarRoomTeamStrategy(store, onProposal, modelFactory);
    return new Map([
        [react.name, react],
        [planAndExecute.name, planAndExecute],
        [team.name, team],
    ]);
}

export const strategyRegistry = createStrategyRegistry();

export { createProductionGraph, runProductionGraph } from "../graph/production-graph.js";
export type { ProductionGraphInput, ProductionGraphOptions, RoutingDecision } from "../graph/production-graph.js";