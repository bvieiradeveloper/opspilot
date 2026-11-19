import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { z } from "zod";
import {
    requestMetricsSchema,
    requestRecordSchema,
    requestStatusSchema,
    requestAnalyticsRecordSchema,
    requestTraceEventSchema,
    requestTraceResultSchema,
    type CompleteRequestInput,
    type RequestAnalyticsRecord,
    type RequestTraceResult,
    type RequestTraceStore,
    type StartRequestInput,
} from "./request-trace-store.js";

type SqliteRow = Record<string, unknown>;

const DEFAULT_DATABASE_PATH = "./data/opspilot.db";

const startRequestSchema = z.object({
    requestId: z.string().trim().min(1),
    userId: z.string().trim().min(1),
    startedAt: z.string().datetime(),
});

const completeRequestSchema = z.object({
    requestId: z.string().trim().min(1),
    route: z.enum(["react", "plan-and-execute", "reflect:react"]).nullable(),
    status: requestStatusSchema.exclude(["in_progress"]),
    completedAt: z.string().datetime(),
    statusCode: z.number().int().min(100).max(599),
    metrics: requestMetricsSchema.nullable(),
    errorCode: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/).nullable(),
    trace: z.array(z.record(z.string(), z.unknown())),
});

const analyticsWindowSchema = z.object({
    startsAt: z.string().datetime(),
    evaluatedAt: z.string().datetime(),
}).refine(({ startsAt, evaluatedAt }) => startsAt < evaluatedAt, {
    message: "The analytics window start must be before its evaluation time.",
});

function text(row: SqliteRow, column: string): string {
    const value = row[column];
    if (typeof value !== "string") {
        throw new Error(`SQLite returned a non-text value for ${column}.`);
    }
    return value;
}

function nullableText(row: SqliteRow, column: string): string | null {
    const value = row[column];
    if (value === null) return null;
    return text(row, column);
}

function nullableJsonRecord(row: SqliteRow, column: string): Record<string, unknown> | null {
    const value = nullableText(row, column);
    if (value === null) return null;
    const parsed: unknown = JSON.parse(value);
    return requestMetricsSchema.parse(parsed);
}

function toRequestRecord(row: SqliteRow) {
    return requestRecordSchema.parse({
        requestId: text(row, "request_id"),
        userId: text(row, "user_id"),
        route: row.route,
        status: text(row, "status"),
        startedAt: text(row, "started_at"),
        completedAt: nullableText(row, "completed_at"),
        statusCode: row.status_code,
        modelUsed: nullableText(row, "model_used"),
        promptTokens: row.prompt_tokens,
        providerCost: row.provider_cost,
        latencyMs: row.latency_ms,
        metrics: nullableJsonRecord(row, "metrics_json"),
        errorCode: nullableText(row, "error_code"),
    });
}

function toTraceEvent(row: SqliteRow) {
    const payload = JSON.parse(text(row, "payload_json")) as unknown;
    return requestTraceEventSchema.parse({
        sequence: row.sequence,
        node: text(row, "node"),
        payload,
        createdAt: text(row, "created_at"),
    });
}

export class SqliteRequestTraceStore implements RequestTraceStore {
    private readonly db: DatabaseSync;
    private readonly clock: () => Date;

    constructor(
        path = process.env.OPSPILOT_DB ?? DEFAULT_DATABASE_PATH,
        options: { clock?: () => Date } = {},
    ) {
        if (path !== ":memory:") {
            mkdirSync(dirname(resolve(path)), { recursive: true });
        }
        this.db = new DatabaseSync(path);
        this.clock = options.clock ?? (() => new Date());
        this.db.exec(`
            PRAGMA foreign_keys = ON;
            CREATE TABLE IF NOT EXISTS requests (
                request_id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(request_id)) > 0),
                user_id TEXT NOT NULL CHECK (length(trim(user_id)) > 0),
                route TEXT CHECK (route IS NULL OR route IN ('react', 'plan-and-execute', 'reflect:react')),
                status TEXT NOT NULL CHECK (status IN ('in_progress', 'succeeded', 'failed', 'timed_out')),
                started_at TEXT NOT NULL,
                completed_at TEXT,
                status_code INTEGER,
                model_used TEXT,
                prompt_tokens INTEGER CHECK (prompt_tokens IS NULL OR prompt_tokens >= 0),
                provider_cost REAL CHECK (provider_cost IS NULL OR provider_cost >= 0),
                latency_ms REAL CHECK (latency_ms IS NULL OR latency_ms >= 0),
                metrics_json TEXT CHECK (metrics_json IS NULL OR json_valid(metrics_json)),
                error_code TEXT,
                CHECK (
                    (status = 'in_progress' AND completed_at IS NULL AND status_code IS NULL
                        AND route IS NULL AND model_used IS NULL AND prompt_tokens IS NULL
                        AND latency_ms IS NULL AND metrics_json IS NULL AND error_code IS NULL)
                    OR (status != 'in_progress' AND completed_at IS NOT NULL AND status_code IS NOT NULL)
                )
            );
            CREATE TABLE IF NOT EXISTS trace_events (
                request_id TEXT NOT NULL REFERENCES requests(request_id) ON DELETE CASCADE,
                sequence INTEGER NOT NULL CHECK (sequence > 0),
                node TEXT NOT NULL CHECK (length(trim(node)) > 0),
                payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
                created_at TEXT NOT NULL,
                PRIMARY KEY (request_id, sequence)
            );
            CREATE INDEX IF NOT EXISTS idx_requests_started_at ON requests(started_at);
        `);
        const requestColumns = this.db.prepare("PRAGMA table_info(requests)").all() as SqliteRow[];
        if (!requestColumns.some((column) => column.name === "provider_cost")) {
            this.db.exec(`
                ALTER TABLE requests ADD COLUMN provider_cost REAL
                    CHECK (provider_cost IS NULL OR provider_cost >= 0)
            `);
        }
    }

    startRequest(input: StartRequestInput): void {
        const request = startRequestSchema.parse(input);
        this.db.prepare(`
            INSERT INTO requests (
                request_id, user_id, route, status, started_at, completed_at, status_code,
                model_used, prompt_tokens, latency_ms, metrics_json, error_code
            )
            VALUES (?, ?, NULL, 'in_progress', ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
        `).run(request.requestId, request.userId, request.startedAt);
    }

    completeRequest(input: CompleteRequestInput): void {
        const completion = completeRequestSchema.parse(input);
        const metricsJson = completion.metrics === null ? null : JSON.stringify(completion.metrics);
        const modelUsed = completion.metrics?.modelUsed ?? null;
        const promptTokens = completion.metrics?.promptTokens ?? null;
        const latencyMs = completion.metrics?.latencyMs ?? null;
        const insertTrace = this.db.prepare(`
            INSERT INTO trace_events (request_id, sequence, node, payload_json, created_at)
            VALUES (?, ?, ?, ?, ?)
        `);
        const updateRequest = this.db.prepare(`
            UPDATE requests
            SET route = ?, status = ?, completed_at = ?, status_code = ?, model_used = ?,
                prompt_tokens = ?, provider_cost = ?, latency_ms = ?, metrics_json = ?, error_code = ?
            WHERE request_id = ? AND status = 'in_progress'
        `);
        const updateValues: SQLInputValue[] = [
            completion.route,
            completion.status,
            completion.completedAt,
            completion.statusCode,
            modelUsed,
            promptTokens,
            completion.metrics?.providerCost ?? null,
            latencyMs,
            metricsJson,
            completion.errorCode,
            completion.requestId,
        ];

        this.db.exec("BEGIN IMMEDIATE");
        try {
            const result = updateRequest.run(...updateValues);
            if (result.changes !== 1) {
                throw new Error("Request is missing or already finalized.");
            }

            completion.trace.forEach((event, index) => {
                const payload = JSON.stringify(event);
                if (payload === undefined) {
                    throw new Error("Trace event could not be serialized as JSON.");
                }
                const node = typeof event.node === "string" ? event.node : "";
                insertTrace.run(
                    completion.requestId,
                    index + 1,
                    node,
                    payload,
                    this.clock().toISOString(),
                );
            });
            this.db.exec("COMMIT");
        } catch (error) {
            if (this.db.isTransaction) this.db.exec("ROLLBACK");
            throw error;
        }
    }

    getRequestWithTrace(requestId: string): RequestTraceResult | null {
        const normalizedId = z.string().trim().min(1).parse(requestId);
        const requestRow = this.db.prepare(`
            SELECT request_id, user_id, route, status, started_at, completed_at, status_code,
                model_used, prompt_tokens, provider_cost, latency_ms, metrics_json, error_code
            FROM requests
            WHERE request_id = ?
        `).get(normalizedId) as SqliteRow | undefined;
        if (!requestRow) return null;

        const traceRows = this.db.prepare(`
            SELECT sequence, node, payload_json, created_at
            FROM trace_events
            WHERE request_id = ?
            ORDER BY sequence ASC
        `).all(normalizedId) as SqliteRow[];
        return requestTraceResultSchema.parse({
            request: toRequestRecord(requestRow),
            trace: traceRows.map(toTraceEvent),
        });
    }

    getRequestsInWindow(startsAt: string, evaluatedAt: string): RequestAnalyticsRecord[] {
        const window = analyticsWindowSchema.parse({ startsAt, evaluatedAt });
        const rows = this.db.prepare(`
            SELECT request_id, started_at, status, route, model_used, prompt_tokens,
                provider_cost, latency_ms
            FROM requests
            WHERE started_at >= ? AND started_at < ?
            ORDER BY started_at ASC, request_id ASC
        `).all(window.startsAt, window.evaluatedAt) as SqliteRow[];
        return rows.map((row) => requestAnalyticsRecordSchema.parse({
            requestId: text(row, "request_id"),
            startedAt: text(row, "started_at"),
            status: text(row, "status"),
            route: row.route,
            modelUsed: nullableText(row, "model_used"),
            promptTokens: row.prompt_tokens,
            providerCost: row.provider_cost,
            latencyMs: row.latency_ms,
        }));
    }

    close(): void {
        this.db.close();
    }
}

export function createConfiguredSqliteRequestTraceStore(): SqliteRequestTraceStore {
    return new SqliteRequestTraceStore();
}
