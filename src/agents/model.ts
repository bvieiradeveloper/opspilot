import { ChatOpenAI } from "@langchain/openai";
import type { BaseChatOpenAIFields } from "@langchain/openai";
import type { Runnable } from "@langchain/core/runnables";
import { RunnableLambda, type RunnableConfig } from "@langchain/core/runnables";
import { z } from "zod";
import { ModelUnavailableError } from "./errors.js";

const optionalModelNameSchema = z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(1).optional(),
);
const openRouterEnvironmentSchema = z.object({
    OPENROUTER_API_KEY: z.string().trim().min(1),
    OPENROUTER_MODEL: z.string().trim().min(1),
    OPENROUTER_MODEL_FALLBACK: optionalModelNameSchema,
});

export class ModelConfigurationError extends Error {
    constructor() {
        super("OPENROUTER_API_KEY and OPENROUTER_MODEL must be configured; OPENROUTER_MODEL_FALLBACK must be valid when provided.");
        this.name = "ModelConfigurationError";
    }
}

type CandidateMetadata = {
    primaryModelId: string;
    fallbackModelId?: string;
};

function createOpenRouterClient(model: string, apiKey: string): ChatOpenAI {
    return new ChatOpenAI({
        model,
        apiKey,
        configuration: { baseURL: "https://openrouter.ai/api/v1" },
        temperature: 0,
    });
}

export function createResilientRunnable<Input, Output>(
    primary: Runnable<Input, Output>,
    fallback: Runnable<Input, Output> | undefined,
    candidates: CandidateMetadata,
): Runnable<Input, Output> {
    const primaryConfigured = typeof primary.withConfig === "function" ? primary.withConfig({
        runName: "ops-pilot-primary-model",
        metadata: { opsPilotModelId: candidates.primaryModelId, opsPilotModelRole: "primary" },
    }) : primary;
    const primaryWithRetry = typeof primaryConfigured.withRetry === "function"
        ? primaryConfigured.withRetry({ stopAfterAttempt: 2 })
        : primaryConfigured;
    const fallbackConfigured = fallback && candidates.fallbackModelId
        ? typeof fallback.withConfig === "function" ? fallback.withConfig({
            runName: "ops-pilot-fallback-model",
            metadata: {
                opsPilotModelId: candidates.fallbackModelId,
                opsPilotModelRole: "fallback",
                opsPilotPrimaryModelId: candidates.primaryModelId,
            },
        }) : fallback
        : undefined;
    const fallbackWithRetry = fallbackConfigured && typeof fallbackConfigured.withRetry === "function"
        ? fallbackConfigured.withRetry({ stopAfterAttempt: 2 })
        : fallbackConfigured;
    if (fallbackWithRetry && typeof primaryWithRetry.withFallbacks !== "function") {
        throw new Error("The primary model runnable does not support configured fallbacks.");
    }
    const resilient = fallbackWithRetry
        ? primaryWithRetry.withFallbacks([fallbackWithRetry])
        : primaryWithRetry;

    return RunnableLambda.from(async (input: Input, config?: RunnableConfig) => {
        try {
            return await resilient.invoke(input, config);
        } catch (error) {
            if (error instanceof ModelUnavailableError) throw error;
            if (error instanceof ModelConfigurationError) throw error;
            if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) throw error;
            if (config?.signal?.aborted) throw error;
            throw new ModelUnavailableError();
        }
    });
}

class FallbackChatOpenAI extends ChatOpenAI {
    constructor(
        fields: BaseChatOpenAIFields,
        readonly fallbackModel: ChatOpenAI | undefined,
        readonly candidateMetadata: CandidateMetadata,
    ) {
        super(fields);
    }

    override bindTools(...args: Parameters<ChatOpenAI["bindTools"]>): ReturnType<ChatOpenAI["bindTools"]> {
        const primary = super.bindTools(...args);
        const fallback = this.fallbackModel?.bindTools(...args);
        return createResilientRunnable(primary, fallback, this.candidateMetadata);
    }
}

export type ModelCandidates = {
    primary: ChatOpenAI;
    fallback?: ChatOpenAI;
    primaryModelId: string;
    fallbackModelId?: string;
};

export function createModelCandidates(environment: NodeJS.ProcessEnv = process.env): ModelCandidates {
    const parsed = openRouterEnvironmentSchema.safeParse(environment);
    if (!parsed.success) {
        throw new ModelConfigurationError();
    }

    const fallbackModelId = parsed.data.OPENROUTER_MODEL_FALLBACK;
    const fallback = fallbackModelId
        ? createOpenRouterClient(fallbackModelId, parsed.data.OPENROUTER_API_KEY)
        : undefined;
    const candidateMetadata: CandidateMetadata = {
        primaryModelId: parsed.data.OPENROUTER_MODEL,
        fallbackModelId,
    };
    const primary = new FallbackChatOpenAI({
        model: parsed.data.OPENROUTER_MODEL,
        apiKey: parsed.data.OPENROUTER_API_KEY,
        configuration: { baseURL: "https://openrouter.ai/api/v1" },
        temperature: 0,
    }, fallback, candidateMetadata);

    return {
        primary,
        fallback,
        primaryModelId: candidateMetadata.primaryModelId,
        fallbackModelId,
    };
}

export function createModel(environment: NodeJS.ProcessEnv = process.env): ChatOpenAI {
    return createModelCandidates(environment).primary;
}

export function getModelCandidates(modelFactory: typeof createModel = createModel): ModelCandidates {
    const primary = modelFactory();
    if (primary instanceof FallbackChatOpenAI) {
        return {
            primary,
            fallback: primary.fallbackModel,
            primaryModelId: primary.candidateMetadata.primaryModelId,
            fallbackModelId: primary.candidateMetadata.fallbackModelId,
        };
    }
    const primaryModelId = primary.model;
    return { primary, primaryModelId };
}

export function createChatModelRunnable(candidates: ModelCandidates) {
    return createResilientRunnable(
        candidates.primary,
        candidates.fallback,
        candidates,
    );
}

export function createStructuredModelRunnable<Schema extends z.ZodType>(
    candidates: ModelCandidates,
    schema: Schema,
): ReturnType<ChatOpenAI["withStructuredOutput"]> {
    return createResilientRunnable(
        candidates.primary.withStructuredOutput(schema),
        candidates.fallback?.withStructuredOutput(schema),
        candidates,
    );
}