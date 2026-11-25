import { z } from "zod";
import { supportedRouteSchema } from "../agents/reasoning.js";

const logMetadataSchema = z.object({
    timestamp: z.string().datetime().optional(),
    event: z.string().trim().min(1),
    requestId: z.string().trim().min(1).optional(),
    node: z.string().trim().min(1).optional(),
    route: supportedRouteSchema.optional(),
    outcome: z.enum(["in_progress", "succeeded", "failed", "timed_out"]).optional(),
    statusCode: z.number().int().min(100).max(599).optional(),
    durationMs: z.number().finite().nonnegative().optional(),
    promptTokens: z.number().int().nonnegative().nullable().optional(),
}).strip();

export type LogMetadata = z.input<typeof logMetadataSchema>;

export interface OperationalLogger {
    info(metadata: LogMetadata): void;
}

export function createJsonLineLogger(
    write: (line: string) => void = (line) => { process.stdout.write(`${line}\n`); },
): OperationalLogger {
    return {
        info(metadata): void {
            const record = logMetadataSchema.parse({
                ...metadata,
                timestamp: metadata.timestamp ?? new Date().toISOString(),
            });
            write(JSON.stringify({ level: "info", ...record }));
        },
    };
}
