import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { UnknownConversationError } from "../agents/errors.js";
import {
    conversationMessageSchema,
    conversationMessageRoleSchema,
    conversationSummarySchema,
    type ConversationMessage,
    type ConversationMessageRole,
    type ConversationStore,
    type ConversationSummary,
} from "./conversation-store.js";

type SqliteRow = Record<string, unknown>;

export type SqliteConversationStoreOptions = {
    idFactory?: () => string;
    clock?: () => Date;
};

const DEFAULT_DATABASE_PATH = "./data/opspilot.db";

function text(row: SqliteRow, column: string): string {
    const value = row[column];
    if (typeof value !== "string") {
        throw new Error(`SQLite returned a non-text value for ${column}.`);
    }
    return value;
}

function number(row: SqliteRow, column: string): number {
    const value = row[column];
    if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new Error(`SQLite returned a non-integer value for ${column}.`);
    }
    return value;
}

function toConversationMessage(row: SqliteRow): ConversationMessage {
    return conversationMessageSchema.parse({
        conversationId: text(row, "conversation_id"),
        role: conversationMessageRoleSchema.parse(text(row, "role")),
        content: text(row, "content"),
        sequence: number(row, "sequence"),
        createdAt: text(row, "created_at"),
    });
}

export class SqliteConversationStore implements ConversationStore {
    private readonly db: DatabaseSync;
    private readonly idFactory: () => string;
    private readonly clock: () => Date;

    constructor(
        path = process.env.OPSPILOT_DB ?? DEFAULT_DATABASE_PATH,
        options: SqliteConversationStoreOptions = {},
    ) {
        if (path !== ":memory:") {
            mkdirSync(dirname(resolve(path)), { recursive: true });
        }
        this.db = new DatabaseSync(path);
        this.idFactory = options.idFactory ?? (() => `conversation-${randomUUID()}`);
        this.clock = options.clock ?? (() => new Date());
        this.db.exec(`
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL REFERENCES conversations(id),
                sequence INTEGER NOT NULL CHECK (sequence > 0),
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL CHECK (length(trim(content)) > 0),
                created_at TEXT NOT NULL,
                UNIQUE (conversation_id, sequence)
            );
            CREATE INDEX IF NOT EXISTS messages_conversation_sequence
                ON messages (conversation_id, sequence);
            CREATE TABLE IF NOT EXISTS conversation_summaries (
                conversation_id TEXT PRIMARY KEY REFERENCES conversations(id),
                summary TEXT NOT NULL CHECK (length(trim(summary)) > 0),
                summarized_through_sequence INTEGER NOT NULL CHECK (summarized_through_sequence > 0),
                updated_at TEXT NOT NULL
            );
        `);
    }

    create(): string {
        const id = this.idFactory();
        if (!id.trim()) {
            throw new Error("Conversation ID generator returned an empty identifier.");
        }
        this.db.prepare("INSERT INTO conversations (id, created_at) VALUES (?, ?)")
            .run(id, this.clock().toISOString());
        return id;
    }

    append(conversationId: string, role: ConversationMessageRole, content: string): void {
        const normalizedId = conversationId.trim();
        const normalizedRole = conversationMessageRoleSchema.parse(role);
        const normalizedContent = content.trim();
        if (!normalizedId) {
            throw new Error("Conversation ID is required.");
        }
        if (!normalizedContent) {
            throw new Error("Message content must not be empty.");
        }
        this.assertConversationExists(normalizedId);

        const sequenceRow = this.db.prepare(`
            SELECT COALESCE(MAX(sequence), 0) + 1 AS next_sequence
            FROM messages
            WHERE conversation_id = ?
        `).get(normalizedId);
        if (!sequenceRow) {
            throw new Error("SQLite did not return the next message sequence.");
        }
        const sequence = number(sequenceRow, "next_sequence");
        this.db.prepare(`
            INSERT INTO messages (conversation_id, sequence, role, content, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(normalizedId, sequence, normalizedRole, normalizedContent, this.clock().toISOString());
    }

    lastMessages(conversationId: string, limit: number): ConversationMessage[] {
        const normalizedId = conversationId.trim();
        if (!normalizedId) {
            throw new Error("Conversation ID is required.");
        }
        if (!Number.isInteger(limit) || limit < 0) {
            throw new Error("Message history limit must be a non-negative integer.");
        }
        this.assertConversationExists(normalizedId);
        if (limit === 0) {
            return [];
        }
        return this.db.prepare(`
            SELECT conversation_id, sequence, role, content, created_at
            FROM messages
            WHERE conversation_id = ?
            ORDER BY sequence DESC
            LIMIT ?
        `).all(normalizedId, limit)
            .map((row) => toConversationMessage(row as SqliteRow))
            .reverse();
    }

    getSummary(conversationId: string): ConversationSummary | null {
        const normalizedId = conversationId.trim();
        if (!normalizedId) throw new Error("Conversation ID is required.");
        this.assertConversationExists(normalizedId);
        const row = this.db.prepare(`
            SELECT conversation_id, summary, summarized_through_sequence, updated_at
            FROM conversation_summaries
            WHERE conversation_id = ?
        `).get(normalizedId);
        if (!row) return null;
        return conversationSummarySchema.parse({
            conversationId: text(row as SqliteRow, "conversation_id"),
            summary: text(row as SqliteRow, "summary"),
            summarizedThroughSequence: number(row as SqliteRow, "summarized_through_sequence"),
            updatedAt: text(row as SqliteRow, "updated_at"),
        });
    }

    saveSummary(
        conversationId: string,
        summary: string,
        summarizedThroughSequence: number,
        expectedThroughSequence: number,
    ): boolean {
        const normalizedId = conversationId.trim();
        const normalizedSummary = summary.trim();
        if (!normalizedId) throw new Error("Conversation ID is required.");
        if (!normalizedSummary) throw new Error("Conversation summary must not be empty.");
        if (!Number.isInteger(summarizedThroughSequence) || summarizedThroughSequence <= 0) {
            throw new Error("Summarized message sequence must be a positive integer.");
        }
        if (!Number.isInteger(expectedThroughSequence) || expectedThroughSequence < 0) {
            throw new Error("Expected summary sequence must be a non-negative integer.");
        }
        this.assertConversationExists(normalizedId);

        const current = this.db.prepare(`
            SELECT summarized_through_sequence
            FROM conversation_summaries
            WHERE conversation_id = ?
        `).get(normalizedId);
        const currentSequence = current
            ? number(current as SqliteRow, "summarized_through_sequence")
            : 0;
        if (currentSequence !== expectedThroughSequence) return false;

        this.db.prepare(`
            INSERT INTO conversation_summaries
                (conversation_id, summary, summarized_through_sequence, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(conversation_id) DO UPDATE SET
                summary = excluded.summary,
                summarized_through_sequence = excluded.summarized_through_sequence,
                updated_at = excluded.updated_at
        `).run(normalizedId, normalizedSummary, summarizedThroughSequence, this.clock().toISOString());
        return true;
    }

    close(): void {
        this.db.close();
    }

    private assertConversationExists(id: string): void {
        const row = this.db.prepare("SELECT 1 AS found FROM conversations WHERE id = ?").get(id);
        if (!row) {
            throw new UnknownConversationError("The requested conversation does not exist.");
        }
    }
}

export function createConfiguredSqliteConversationStore(
    options: SqliteConversationStoreOptions = {},
): SqliteConversationStore {
    return new SqliteConversationStore(process.env.OPSPILOT_DB ?? DEFAULT_DATABASE_PATH, options);
}
