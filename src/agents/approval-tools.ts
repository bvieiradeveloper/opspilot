import type { OpsStore } from "../store/ops-store.js";
import { createOpsTools } from "./tools.js";
import type { IncidentProposal } from "../services/approval-service.js";

export type IncidentProposalHandler = (proposal: IncidentProposal) => void;

export function createApprovalAwareTools(store: OpsStore, onProposal: IncidentProposalHandler) {
    return createOpsTools(store, fetch, {
        onIncidentProposal: (proposal) => {
            if (proposal.tool === "open_incident") {
                onProposal({ tool: "open_incident", arguments: proposal.args });
            } else {
                onProposal({ tool: "resolve_incident", arguments: proposal.args });
            }
        },
    });
}
