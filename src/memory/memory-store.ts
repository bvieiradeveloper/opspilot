import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { EMBEDDING_DIMENSIONS, embed, type Embed, type Embedding } from "./embeddings.js";

const memorySchema = z.object({
    id: z.string().trim().min(1),
    userId: z.string().trim().min(1),
    fact: z.string().trim().min(1),
    embedding: z.custom<Embedding>((value) => value instanceof Float32Array
        && value.length === EMBEDDING_DIMENSIONS
        && [...value].every(Number.isFinite)),
    createdAt: z.string().datetime(),
});

export type Memory = z.infer<typeof memorySchema>;
export type RecalledMemory = Memory & { score: number };

export class MemoryNotFoundError extends Error {
    constructor() {
        super("The requested memory was not found.");
        this.name = "MemoryNotFoundError";
    }
}

export interface MemoryStore {
    remember(userId: string, fact: string): Promise<{ memory: Memory; created: boolean }>;
    recall(userId: string, query: string, k?: number): Promise<RecalledMemory[]>;
    list(userId: string): Memory[];
    forget(userId: string, memoryId: string): void;
    close(): void;
}

type SqliteRow = Record<string, unknown>;

const DEFAULT_DATABASE_PATH = "./data/opspilot.db";
const DEDUPLICATION_THRESHOLD = 0.92;
const MINIMUM_RECALL_SCORE = 0.3;

function validateUserId(userId: string): string {
    return z.string().trim().min(1, "A non-empty userId is required.").parse(userId);
}

function validateFact(fact: string): string {
    return z.string().trim().min(1, "A non-empty fact is required.").parse(fact);
}

function validateEmbedding(embedding: Embedding): Embedding {
    if (!(embedding instanceof Float32Array)
        || embedding.length !== EMBEDDING_DIMENSIONS
        || [...embedding].some((value) => !Number.isFinite(value))) {
        throw new Error(`Embedding must contain ${EMBEDDING_DIMENSIONS} finite float32 values.`);
    }
    return embedding;
}

function encodeEmbedding(embedding: Embedding): Uint8Array {
    validateEmbedding(embedding);
    return new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

function decodeEmbedding(value: unknown): Embedding {
    if (!(value instanceof Uint8Array) || value.byteLength !== EMBEDDING_DIMENSIONS * Float32Array.BYTES_PER_ELEMENT) {
        throw new Error(`SQLite memory embedding must contain ${EMBEDDING_DIMENSIONS * Float32Array.BYTES_PER_ELEMENT} bytes.`);
    }
    const copy = Uint8Array.from(value);
    return validateEmbedding(new Float32Array(copy.buffer));
}

function text(row: SqliteRow, column: string): string {
    const value = row[column];
    if (typeof value !== "string") {
        throw new Error(`SQLite returned a non-text value for ${column}.`);
    }
    return value;
}

function toMemory(row: SqliteRow): Memory {
    return memorySchema.parse({
        id: text(row, "id"),
        userId: text(row, "user_id"),
        fact: text(row, "fact"),
        embedding: decodeEmbedding(row.embedding),
        createdAt: text(row, "created_at"),
    });
}

export function dot(left: Embedding, right: Embedding): number {
    validateEmbedding(left);
    validateEmbedding(right);
    let score = 0;
    for (let index = 0; index < EMBEDDING_DIMENSIONS; index += 1) {
        score += left[index]! * right[index]!;
    }
    return score;
}

export type SqliteMemoryStoreOptions = {
    idFactory?: () => string;
    clock?: () => Date;
    embed?: Embed;
};

export class SqliteMemoryStore implements MemoryStore {
    private readonly db: DatabaseSync;
    private readonly idFactory: () => string;
    private readonly clock: () => Date;
    private readonly embedText: Embed;

    constructor(
        path = process.env.OPSPILOT_DB ?? DEFAULT_DATABASE_PATH,
        options: SqliteMemoryStoreOptions = {},
    ) {
        if (path !== ":memory:") {
            mkdirSync(dirname(resolve(path)), { recursive: true });
        }
        this.db = new DatabaseSync(path);
        this.idFactory = options.idFactory ?? (() => `memory-${randomUUID()}`);
        this.clock = options.clock ?? (() => new Date());
        this.embedText = options.embed ?? embed;
        this.db.exec(`
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
                fact TEXT NOT NULL CHECK (length(trim(fact)) > 0),
                embedding BLOB NOT NULL CHECK (length(embedding) = ${EMBEDDING_DIMENSIONS * Float32Array.BYTES_PER_ELEMENT}),
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS memories_user_created_at
                ON memories (user_id, created_at);
        `);
    }

    async remember(userId: string, fact: string): Promise<{ memory: Memory; created: boolean }> {
        const owner = validateUserId(userId);
        const normalizedFact = validateFact(fact);
        const vector = validateEmbedding(await this.embedText(normalizedFact));
        const existing = this.db.prepare(`
            SELECT id, user_id, fact, embedding, created_at
            FROM memories WHERE user_id = ?
            ORDER BY created_at, id
        `).all(owner).map((row) => toMemory(row as SqliteRow));
        const duplicate = existing.find((memory) => dot(vector, memory.embedding) > DEDUPLICATION_THRESHOLD);
        if (duplicate) {
            return { memory: duplicate, created: false };
        }

        const id = this.idFactory();
        if (!id.trim()) {
            throw new Error("Memory ID generator returned an empty identifier.");
        }
        const createdAt = this.clock().toISOString();
        this.db.prepare(`
            INSERT INTO memories (id, user_id, fact, embedding, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, owner, normalizedFact, encodeEmbedding(vector), createdAt);
        return {
            memory: memorySchema.parse({
                id,
                userId: owner,
                fact: normalizedFact,
                embedding: vector,
                createdAt,
            }),
            created: true,
        };
    }

    async recall(userId: string, query: string, k = 3): Promise<RecalledMemory[]> {
        const owner = validateUserId(userId);
        const normalizedQuery = z.string().trim().min(1, "A non-empty query is required.").parse(query);
        const limit = Math.min(3, z.number().int().nonnegative().parse(k));
        if (limit === 0) {
            return [];
        }
        const queryEmbedding = validateEmbedding(await this.embedText(normalizedQuery));
        return this.list(owner)
            .map((memory) => ({ ...memory, score: dot(queryEmbedding, memory.embedding) }))
            .filter(({ score }) => score >= MINIMUM_RECALL_SCORE)
            .sort((left, right) => right.score - left.score
                || left.createdAt.localeCompare(right.createdAt)
                || left.id.localeCompare(right.id))
            .slice(0, limit);
    }

    list(userId: string): Memory[] {
        const owner = validateUserId(userId);
        return this.db.prepare(`
            SELECT id, user_id, fact, embedding, created_at
            FROM memories
            WHERE user_id = ?
            ORDER BY created_at, id
        `).all(owner).map((row) => toMemory(row as SqliteRow));
    }

    forget(userId: string, memoryId: string): void {
        const owner = validateUserId(userId);
        const id = z.string().trim().min(1, "A non-empty memoryId is required.").parse(memoryId);
        const result = this.db.prepare("DELETE FROM memories WHERE id = ? AND user_id = ?").run(id, owner);
        if (result.changes !== 1) {
            throw new MemoryNotFoundError();
        }
    }

    close(): void {
        this.db.close();
    }
}

export function createConfiguredSqliteMemoryStore(options: SqliteMemoryStoreOptions = {}): SqliteMemoryStore {
    return new SqliteMemoryStore(process.env.OPSPILOT_DB ?? DEFAULT_DATABASE_PATH, options);
}
