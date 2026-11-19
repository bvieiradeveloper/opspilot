import { z } from "zod";

export const conversationMessageRoleSchema = z.enum(["user", "assistant"]);

export const conversationMessageSchema = z.object({
    conversationId: z.string().trim().min(1),
    role: conversationMessageRoleSchema,
    content: z.string().trim().min(1),
    sequence: z.number().int().positive(),
    createdAt: z.string().datetime(),
});

export type ConversationMessageRole = z.infer<typeof conversationMessageRoleSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;

export const conversationSummarySchema = z.object({
    conversationId: z.string().trim().min(1),
    summary: z.string().trim().min(1),
    summarizedThroughSequence: z.number().int().positive(),
    updatedAt: z.string().datetime(),
});

export type ConversationSummary = z.infer<typeof conversationSummarySchema>;

export interface ConversationStore {
    create(): string;
    append(conversationId: string, role: ConversationMessageRole, content: string): void;
    lastMessages(conversationId: string, limit: number): ConversationMessage[];
    getSummary?(conversationId: string): ConversationSummary | null;
    saveSummary?(conversationId: string, summary: string, summarizedThroughSequence: number, expectedThroughSequence: number): boolean;
    close(): void;
}
