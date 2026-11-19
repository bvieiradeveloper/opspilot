import { z } from "zod";
import { traceSchema } from "./trace.js";

export const approvalProposalSchema = z.object({
    id: z.string().min(1),
    status: z.literal("pending"),
    tool: z.enum(["open_incident", "resolve_incident"]),
    arguments: z.record(z.string(), z.unknown()),
    description: z.string().min(1),
    createdAt: z.string().datetime(),
});

export const chatResponseSchema = z.object({
    requestId: z.string().min(1),
    conversationId: z.string().min(1),
    answer: z.string(),
    trace: traceSchema,
    metrics: z.object({
        IICalls: z.number().int().nonnegative(),
        latencyMs: z.number().finite().nonnegative(),
        modelUsed: z.string().min(1).optional(),
        promptTokens: z.number().int().nonnegative().nullable(),
        providerCost: z.number().finite().nonnegative().nullable().optional(),
        contextBreakdown: z.record(z.string(), z.number().int().nonnegative()),
        historyMessages: z.number().int().nonnegative().max(8),
    }),
    approvals: z.array(approvalProposalSchema).optional(),
});

export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type MessageStatus = "sending" | "complete" | "failed" | "awaiting_approval";
export type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    status: MessageStatus;
    trace?: ChatResponse["trace"];
    approvals?: ChatResponse["approvals"];
    retryKey?: string;
    error?: string;
};

export function parseChatResponse(status: number, body: unknown): ChatResponse {
    const parsed = chatResponseSchema.parse(body);
    if (status === 202 && (!parsed.approvals || parsed.approvals.length === 0)) {
        throw new Error("The service returned an invalid pending-approval response.");
    }
    if (status === 200 && parsed.approvals?.length) {
        throw new Error("The service returned approval proposals with an unexpected success status.");
    }
    if (status !== 200 && status !== 202) {
        throw new Error(`Unexpected chat response status: ${status}.`);
    }
    return parsed;
}
