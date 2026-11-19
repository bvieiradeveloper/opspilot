import { randomUUID } from "node:crypto";
import { z } from "zod";
import { openIncidentInputSchema, resolveIncidentInputSchema } from "../agents/tools.js";
import type { OpsStore } from "../store/ops-store.js";
import type {
    ApprovalDecision,
    ApprovalRecord,
    ApprovalStore,
} from "../store/approval-store.js";

const proposalSchema = z.discriminatedUnion("tool", [
    z.object({ tool: z.literal("open_incident"), arguments: openIncidentInputSchema }),
    z.object({ tool: z.literal("resolve_incident"), arguments: resolveIncidentInputSchema }),
]);

export type IncidentProposal = z.infer<typeof proposalSchema>;

export type ApprovalDecisionResult =
    | { kind: "not_found" }
    | { kind: "conflict"; approval: ApprovalRecord }
    | { kind: "executing"; approval: ApprovalRecord }
    | { kind: "completed"; approval: ApprovalRecord };

export class ApprovalService {
    private readonly store: ApprovalStore;
    private readonly operations: OpsStore;
    private readonly idFactory: () => string;
    private readonly clock: () => Date;

    constructor(options: {
        store: ApprovalStore;
        operations: OpsStore;
        idFactory?: () => string;
        clock?: () => Date;
    }) {
        this.store = options.store;
        this.operations = options.operations;
        this.idFactory = options.idFactory ?? randomUUID;
        this.clock = options.clock ?? (() => new Date());
    }

    private normalizeServiceAlias(service: string): string {
        const services = this.operations.listServices();
        if (services.some((candidate) => candidate.id === service || candidate.name === service)) {
            return service;
        }

        const alias = service.trim().toLowerCase();
        const matches = services.filter(({ name }) =>
            name.replace(/-(?:api|service)$/i, "").toLowerCase() === alias,
        );
        return matches.length === 1 ? matches[0]!.name : service;
    }

    propose(input: {
        requestId: string;
        conversationId: string;
        userId: string;
        tool: string;
        arguments: Record<string, unknown>;
    }): ApprovalRecord {
        const parsed = proposalSchema.parse({ tool: input.tool, arguments: input.arguments });
        const proposal = parsed.tool === "open_incident"
            ? {
                ...parsed,
                arguments: {
                    ...parsed.arguments,
                    service: this.normalizeServiceAlias(parsed.arguments.service),
                },
            }
            : parsed;
        const createdAt = this.clock().toISOString();
        const description = proposal.tool === "open_incident"
            ? `Open a ${proposal.arguments.severity} incident for ${proposal.arguments.service}: ${proposal.arguments.title}`
            : `Resolve incident ${proposal.arguments.id}`;
        const common = {
            id: this.idFactory(),
            requestId: z.string().trim().min(1).parse(input.requestId),
            conversationId: z.string().trim().min(1).parse(input.conversationId),
            userId: z.string().trim().min(1).parse(input.userId),
            description,
            createdAt,
        };
        if (proposal.tool === "open_incident") {
            return this.store.createPending({
                ...common,
                tool: "open_incident",
                arguments: proposal.arguments,
            });
        }
        return this.store.createPending({
            ...common,
            tool: "resolve_incident",
            arguments: proposal.arguments,
        });
    }

    decide(id: string, userId: string, decision: ApprovalDecision): ApprovalDecisionResult {
        const claim = this.store.claimDecision(id, userId, decision, this.clock());
        if (claim.kind === "not_found") return claim;
        if (claim.kind === "conflict") return claim;
        if (claim.kind === "existing") {
            return claim.approval.status === "executing"
                ? { kind: "executing", approval: claim.approval }
                : { kind: "completed", approval: claim.approval };
        }
        if (decision === "reject") return { kind: "completed", approval: claim.approval };

        try {
            const result = claim.approval.tool === "open_incident"
                ? this.operations.openIncident(openIncidentInputSchema.parse(claim.approval.arguments))
                : this.operations.resolveIncident(resolveIncidentInputSchema.parse(claim.approval.arguments).id);
            return {
                kind: "completed",
                approval: this.store.complete(claim.approval.id, "executed", result, null, this.clock()),
            };
        } catch {
            return {
                kind: "completed",
                approval: this.store.complete(
                    claim.approval.id,
                    "failed",
                    null,
                    "ACTION_EXECUTION_FAILED",
                    this.clock(),
                ),
            };
        }
    }
}
