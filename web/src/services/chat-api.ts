import { z } from "zod";
import { parseChatResponse, type ChatResponse } from "../models/chat.js";
import { getCurrentApiBaseUrl, joinApiEndpoint } from "./preferences.js";

export class ApiRequestError extends Error {
    constructor(
        message: string,
        readonly status?: number,
        readonly code?: string,
    ) {
        super(message);
        this.name = "ApiRequestError";
    }
}

const errorSchema = z.object({
    error: z.object({
        code: z.string().optional(),
        message: z.string().optional(),
    }).optional(),
});

export type SendChatInput = {
    message: string;
    conversationId?: string;
    strategy?: "team";
    idempotencyKey: string;
    apiBaseUrl?: string;
};

export async function sendChatMessage(
    input: SendChatInput,
    doFetch: typeof fetch = fetch,
): Promise<{ status: 200 | 202; response: ChatResponse }> {
    const payload = z.object({
        message: z.string().trim().min(1),
        conversationId: z.string().trim().min(1).optional(),
        strategy: z.literal("team").optional(),
    }).parse({ message: input.message, conversationId: input.conversationId, strategy: input.strategy });
    const key = z.string().min(1).max(200).parse(input.idempotencyKey);
    const apiBaseUrl = input.apiBaseUrl ?? getCurrentApiBaseUrl();

    let response: Response;
    try {
        response = await doFetch(joinApiEndpoint(apiBaseUrl, "/chat"), {
            method: "POST",
            headers: { "Content-Type": "application/json", "Idempotency-Key": key },
            body: JSON.stringify(payload),
        });
    } catch {
        throw new ApiRequestError("Não foi possível conectar à API. Verifique a rede e a configuração de CORS.");
    }

    let body: unknown;
    try {
        body = await response.json();
    } catch {
        throw new ApiRequestError("A API retornou uma resposta JSON inválida.", response.status);
    }
    if (response.status !== 200 && response.status !== 202) {
        const parsedError = errorSchema.safeParse(body);
        throw new ApiRequestError(
            parsedError.success && parsedError.data.error?.message
                ? parsedError.data.error.message
                : `A API respondeu com HTTP ${response.status}.`,
            response.status,
            parsedError.success ? parsedError.data.error?.code : undefined,
        );
    }
    try {
        const parsed = parseChatResponse(response.status, body);
        return { status: response.status, response: parsed };
    } catch (error) {
        throw new ApiRequestError(
            error instanceof Error ? error.message : "A API retornou dados inválidos.",
            response.status,
        );
    }
}
