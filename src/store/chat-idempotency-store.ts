import { z } from "zod";

export const chatIdempotencyKeySchema = z.string()
    .min(1, "An idempotency key is required.")
    .max(200, "An idempotency key must be at most 200 characters.")
    .regex(/^[\x21-\x7e]+$/, "Idempotency keys must be printable opaque values without whitespace.");

export type ChatIdempotencyClaim =
    | { kind: "claimed" }
    | { kind: "processing" }
    | { kind: "mismatch" }
    | { kind: "replay"; responseStatus: number; responseBody: Record<string, unknown> };

export interface ChatIdempotencyStore {
    claim(key: string, fingerprint: string, now: Date): ChatIdempotencyClaim;
    complete(
        key: string,
        fingerprint: string,
        responseStatus: number,
        responseBody: Record<string, unknown>,
        now: Date,
    ): void;
    close(): void;
}
