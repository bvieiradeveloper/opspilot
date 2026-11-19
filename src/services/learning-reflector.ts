import { z } from "zod";
import { createStructuredModelRunnable, getModelCandidates } from "../agents/model.js";
import type { MemoryStore } from "../memory/memory-store.js";

const learningOutputSchema = z.object({
    hasLearning: z.boolean(),
    fact: z.string().trim().min(1).nullable(),
});

const sensitiveFactPattern = /\b(?:password|passwd|passphrase|api[_ -]?key|secret[_ -]?key|access[_ -]?token|refresh[_ -]?token|otp|one[- ]time (?:password|passcode|code)|(?:two|2)[- ]factor (?:authentication )?code|verification code|recovery code)\b\s*(?:(?:is|equals|:|=)\s*)\S+|\bbearer\s+\S+|\b(?:sk-[a-z0-9_-]{12,}|gh[pousr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i;

export type LearningAssessment = z.infer<typeof learningOutputSchema>;

export type LearningTurn = {
    userId: string;
    message: string;
};

export type LearningReflector = (turn: LearningTurn) => Promise<void>;
export type FactExtractor = (message: string) => Promise<unknown>;

async function assessLatestMessage(message: string): Promise<unknown> {
    const model = createStructuredModelRunnable(getModelCandidates(), learningOutputSchema);
    return model.invoke([{
        role: "user",
        content: `Assess only the user's latest message below. Return hasLearning=true and one concise standalone fact only when the user explicitly states a durable personal fact or preference that will be useful in future conversations. Return hasLearning=false and fact=null for one-time requests, temporary instructions, uncertain facts, or when there is no durable fact. Never include passwords, credentials, API keys, access tokens, one-time authentication codes, or other secrets in fact. Do not use or infer information from any assistant response or previous conversation.\n\nLatest user message:\n${message}`,
    }]);
}

function isSensitiveFact(fact: string): boolean {
    return sensitiveFactPattern.test(fact);
}

export function createLearningReflector(
    memories: MemoryStore,
    extractFact: FactExtractor = assessLatestMessage,
): LearningReflector {
    return async (turn) => {
        const parsedTurn = z.object({
            userId: z.string().trim().min(1),
            message: z.string().trim().min(1),
        }).parse(turn);
        const assessment = learningOutputSchema.parse(await extractFact(parsedTurn.message));
        if (assessment.hasLearning !== (assessment.fact !== null)) {
            throw new Error("Inconsistent learning assessment.");
        }
        if (!assessment.hasLearning || assessment.fact === null || isSensitiveFact(assessment.fact)) {
            return;
        }

        await memories.remember(parsedTurn.userId, assessment.fact);
    };
}
