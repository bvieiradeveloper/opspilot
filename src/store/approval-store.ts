import { z } from "zod";
import { openIncidentInputSchema, resolveIncidentInputSchema } from "../agents/tools.js";

export const approvalDecisionSchema = z.enum(["approve", "reject"]);
export const approvalStatusSchema = z.enum(["pending", "executing", "executed", "rejected", "failed"]);
export const approvalToolSchema = z.enum(["open_incident", "resolve_incident"]);

export const approvalRecordSchema = z.object({
    id: z.string().trim().min(1),
    requestId: z.string().trim().min(1),
    conversationId: z.string().trim().min(1),
    userId: z.string().trim().min(1),
    tool: approvalToolSchema,
    arguments: z.record(z.string(), z.unknown()),
    description: z.string().trim().min(1),
    status: approvalStatusSchema,
    decision: approvalDecisionSchema.nullable(),
    createdAt: z.string().datetime(),
    decidedAt: z.string().datetime().nullable(),
    completedAt: z.string().datetime().nullable(),
    result: z.unknown().nullable(),
    errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).nullable(),
});

export const pendingApprovalInputSchema = z.discriminatedUnion("tool", [
    z.object({
        id: z.string().trim().min(1),
        requestId: z.string().trim().min(1),
        conversationId: z.string().trim().min(1),
        userId: z.string().trim().min(1),
        tool: z.literal("open_incident"),
        arguments: openIncidentInputSchema,
        description: z.string().trim().min(1),
        createdAt: z.string().datetime(),
    }),
    z.object({
        id: z.string().trim().min(1),
        requestId: z.string().trim().min(1),
        conversationId: z.string().trim().min(1),
        userId: z.string().trim().min(1),
        tool: z.literal("resolve_incident"),
        arguments: resolveIncidentInputSchema,
        description: z.string().trim().min(1),
        createdAt: z.string().datetime(),
    }),
]);

export type ApprovalRecord = z.infer<typeof approvalRecordSchema>;
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;
export type PendingApprovalInput = z.input<typeof pendingApprovalInputSchema>;

export type ApprovalDecisionClaim =
    | { kind: "not_found" }
    | { kind: "conflict"; approval: ApprovalRecord }
    | { kind: "existing"; approval: ApprovalRecord }
    | { kind: "claimed"; approval: ApprovalRecord };

export interface ApprovalStore {
    createPending(input: PendingApprovalInput): ApprovalRecord;
    get(id: string): ApprovalRecord | null;
    claimDecision(id: string, userId: string, decision: ApprovalDecision, now: Date): ApprovalDecisionClaim;
    complete(id: string, status: "executed" | "failed", result: unknown, errorCode: string | null, completedAt: Date): ApprovalRecord;
    close(): void;
}
