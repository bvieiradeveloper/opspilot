import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
    chatIdempotencyKeySchema,
    type ChatIdempotencyClaim,
    type ChatIdempotencyStore,
} from "./chat-idempotency-store.js";

const DEFAULT_DATABASE_PATH = "./data/opspilot.db";
const RETENTION_MS = 24 * 60 * 60 * 1000;

type SqliteRow = Record<string, unknown>;

const responseStatusSchema = z.number().int().min(100).max(599);
const responseBodySchema = z.record(z.string(), z.unknown());

export class SqliteChatIdempotencyStore implements ChatIdempotencyStore {
    private readonly db: DatabaseSync;

    constructor(path = process.env.OPSPILOT_DB ?? DEFAULT_DATABASE_PATH) {
        if (path !== ":memory:") {
            mkdirSync(dirname(resolve(path)), { recursive: true });
        }
        this.db = new DatabaseSync(path);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS chat_idempotency (
                idempotency_key TEXT PRIMARY KEY NOT NULL,
                request_fingerprint TEXT NOT NULL,
                status TEXT NOT NULL CHECK (status IN ('processing', 'completed')),
                response_status INTEGER,
                response_body TEXT CHECK (response_body IS NULL OR json_valid(response_body)),
                created_at TEXT NOT NULL,
                completed_at TEXT,
                expires_at TEXT NOT NULL,
                CHECK (
                    (status = 'processing' AND response_status IS NULL AND response_body IS NULL AND completed_at IS NULL)
                    OR (status = 'completed' AND response_status IS NOT NULL AND response_body IS NOT NULL AND completed_at IS NOT NULL)
                )
            );
            CREATE INDEX IF NOT EXISTS idx_chat_idempotency_expires_at ON chat_idempotency(expires_at);
        `);
    }

    claim(key: string, fingerprint: string, now: Date): ChatIdempotencyClaim {
        const parsedKey = chatIdempotencyKeySchema.parse(key);
        const parsedFingerprint = z.string().min(1).max(256).parse(fingerprint);
        const createdAt = z.date().parse(now);
        const expiresAt = new Date(createdAt.getTime() + RETENTION_MS).toISOString();
        const nowIso = createdAt.toISOString();

        this.db.prepare("DELETE FROM chat_idempotency WHERE expires_at <= ?").run(nowIso);
        const inserted = this.db.prepare(`
            INSERT OR IGNORE INTO chat_idempotency (
                idempotency_key, request_fingerprint, status, response_status, response_body,
                created_at, completed_at, expires_at
            ) VALUES (?, ?, 'processing', NULL, NULL, ?, NULL, ?)
        `).run(parsedKey, parsedFingerprint, nowIso, expiresAt);
        if (inserted.changes === 1) {
            return { kind: "claimed" };
        }

        const row = this.db.prepare(`
            SELECT request_fingerprint, status, response_status, response_body
            FROM chat_idempotency WHERE idempotency_key = ?
        `).get(parsedKey) as SqliteRow | undefined;
        if (!row) {
            throw new Error("The idempotency claim could not be read after a conflict.");
        }
        if (row.request_fingerprint !== parsedFingerprint) {
            return { kind: "mismatch" };
        }
        if (row.status === "processing") {
            return { kind: "processing" };
        }
        if (row.status !== "completed" || typeof row.response_status !== "number" || typeof row.response_body !== "string") {
            throw new Error("The stored idempotency response is invalid.");
        }
        const responseBody = responseBodySchema.parse(JSON.parse(row.response_body));
        return {
            kind: "replay",
            responseStatus: responseStatusSchema.parse(row.response_status),
            responseBody,
        };
    }

    complete(
        key: string,
        fingerprint: string,
        responseStatus: number,
        responseBody: Record<string, unknown>,
        now: Date,
    ): void {
        const parsedKey = chatIdempotencyKeySchema.parse(key);
        const parsedFingerprint = z.string().min(1).max(256).parse(fingerprint);
        const parsedStatus = responseStatusSchema.parse(responseStatus);
        const parsedBody = responseBodySchema.parse(responseBody);
        const completedAt = z.date().parse(now).toISOString();
        const result = this.db.prepare(`
            UPDATE chat_idempotency
            SET status = 'completed', response_status = ?, response_body = ?, completed_at = ?
            WHERE idempotency_key = ? AND request_fingerprint = ? AND status = 'processing'
        `).run(parsedStatus, JSON.stringify(parsedBody), completedAt, parsedKey, parsedFingerprint);
        if (result.changes !== 1) {
            throw new Error("The idempotency response could not be saved for its active claim.");
        }
    }

    close(): void {
        this.db.close();
    }
}

export function createConfiguredSqliteChatIdempotencyStore(): SqliteChatIdempotencyStore {
    return new SqliteChatIdempotencyStore();
}
