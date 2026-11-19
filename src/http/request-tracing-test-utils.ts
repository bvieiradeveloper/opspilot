import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { createChatApp, type ChatAppOptions } from "./server.js";
import type { ReasoningStrategy } from "../agents/reasoning.js";
import { EMBEDDING_DIMENSIONS } from "../memory/embeddings.js";
import { SqliteMemoryStore } from "../memory/memory-store.js";
import { createJsonLineLogger, type OperationalLogger } from "../obs/logger.js";
import { SqliteConversationStore } from "../store/sqlite-conversation-store.js";
import { SqliteRequestTraceStore } from "../store/sqlite-request-trace-store.js";

export type RequestTracingTestOptions = Pick<ChatAppOptions, "requestTimeoutMs"> & {
    logger?: OperationalLogger;
    requestTraceStore?: SqliteRequestTraceStore;
};

export async function withRequestTracingServer(
    strategies: ReadonlyMap<string, ReasoningStrategy>,
    run: (baseUrl: string, stores: {
        requests: SqliteRequestTraceStore;
        lines: string[];
    }) => Promise<void>,
    options: RequestTracingTestOptions = {},
): Promise<void> {
    const conversations = new SqliteConversationStore(":memory:");
    const memories = new SqliteMemoryStore(":memory:", {
        embed: async () => {
            const vector = new Float32Array(EMBEDDING_DIMENSIONS);
            vector[0] = 1;
            return vector;
        },
    });
    const requests = options.requestTraceStore ?? new SqliteRequestTraceStore(":memory:");
    const lines: string[] = [];
    const logger = options.logger ?? createJsonLineLogger((line) => lines.push(line));
    const server = createServer(createChatApp({
        strategies,
        conversationStore: conversations,
        memoryStore: memories,
        requestTraceStore: requests,
        logger,
        requestTimeoutMs: options.requestTimeoutMs,
    }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;

    try {
        await run(`http://127.0.0.1:${address.port}`, { requests, lines });
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
        conversations.close();
        memories.close();
        requests.close();
    }
}

export function deterministicStrategy(name = "react"): ReasoningStrategy {
    return {
        name,
        async run(input) {
            const answer = `${name} handled ${input.request}`;
            return {
                answer,
                trace: [
                    { type: "thought", node: name, summary: "deterministic thought" },
                    { type: "answer", node: name, text: answer },
                ],
                metrics: { IICalls: 1, latencyMs: 12, promptTokens: 0 },
            };
        },
    };
}
