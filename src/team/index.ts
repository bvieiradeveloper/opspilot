import type { IncidentProposal } from "../services/approval-service.js";
import type { OpsStore } from "../store/ops-store.js";
import { createApprovalAwareTools } from "../agents/approval-tools.js";
import { createOpsTools } from "../agents/tools.js";
import { createTeamRoleRunners } from "./roles.js";
import { createTeamStrategy } from "./team-graph.js";
import { createTeamSupervisor } from "./supervisor.js";
import type { createModel } from "../agents/model.js";

const READ_ONLY_TOOL_NAMES = new Set([
    "list_alerts",
    "list_incidents",
    "consultar_runbooks",
    "check_provider_status",
]);
const INCIDENT_TOOL_NAMES = new Set(["open_incident", "resolve_incident"]);

export function createWarRoomTeamToolSets(
    store: OpsStore,
    onProposal: (proposal: IncidentProposal) => void,
) {
    const readOnlyTools = createOpsTools(store).filter(({ name }) => READ_ONLY_TOOL_NAMES.has(name));
    const incidentTools = createApprovalAwareTools(store, onProposal)
        .filter(({ name }) => INCIDENT_TOOL_NAMES.has(name));
    return {
        analyst: readOnlyTools,
        planner: [],
        executor: incidentTools,
    };
}

export function createWarRoomTeamStrategy(
    store: OpsStore,
    onProposal: (proposal: IncidentProposal) => void,
    modelFactory?: typeof createModel,
): ReturnType<typeof createTeamStrategy> {
    const toolSets = createWarRoomTeamToolSets(store, onProposal);

    return createTeamStrategy({
        supervisor: createTeamSupervisor(modelFactory),
        roles: createTeamRoleRunners({
            readOnlyTools: toolSets.analyst,
            incidentTools: toolSets.executor,
            modelFactory,
        }),
    });
}

export { createTeamRoleRunners } from "./roles.js";
export { createTeamStrategy } from "./team-graph.js";
export { createTeamSupervisor } from "./supervisor.js";
export * from "./types.js";
