import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { SqliteRequestTraceStore } from "./sqlite-request-trace-store.js";

function withTemporaryDatabase(run: (databasePath: string) => void): void {
    const directory = mkdtempSync(join(tmpdir(), "opspilot-request-trace-"));
    try {
        run(join(directory, "nested", "opspilot.db"));
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

const requestId = "request-1";
const startedAt = "2026-11-11T12:00:00.000Z";
const completedAt = "2026-11-11T12:00:01.000Z";

test("SQLite request trace schema initializes idempotently and supports in-memory stores", () => {
    withTemporaryDatabase((databasePath) => {
        const first = new SqliteRequestTraceStore(databasePath);
        first.close();
        const reopened = new SqliteRequestTraceStore(databasePath);
        try {
            const db = new DatabaseSync(databasePath);
            try {
                const tables = db.prepare(
                    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
                ).all().map((row) => row.name);
                assert.deepEqual(tables, ["requests", "trace_events"]);
            } finally {
                db.close();
            }
            reopened.startRequest({ requestId, userId: "operator-1", startedAt });
            assert.equal(reopened.getRequestWithTrace(requestId)?.request.status, "in_progress");
        } finally {
            reopened.close();
        }
    });
});

test("SQLite request records persist terminal metrics and ordered JSON trace events", () => {
    const store = new SqliteRequestTraceStore(":memory:", {
        clock: () => new Date(completedAt),
    });
    try {
        store.startRequest({ requestId, userId: "operator-1", startedAt });
        store.completeRequest({
            requestId,
            route: "react",
            status: "succeeded",
            completedAt,
            statusCode: 200,
            metrics: { IICalls: 2, latencyMs: 42, promptTokens: 7, modelUsed: "test/model", providerCost: 0.0005 },
            errorCode: null,
            trace: [
                { type: "thought", node: "react", summary: "first" },
                { type: "answer", node: "response", text: "second" },
            ],
        });

        assert.deepEqual(store.getRequestWithTrace(requestId), {
            request: {
                requestId,
                userId: "operator-1",
                route: "react",
                status: "succeeded",
                startedAt,
                completedAt,
                statusCode: 200,
                modelUsed: "test/model",
                promptTokens: 7,
                providerCost: 0.0005,
                latencyMs: 42,
                metrics: { IICalls: 2, latencyMs: 42, promptTokens: 7, modelUsed: "test/model", providerCost: 0.0005 },
                errorCode: null,
            },
            trace: [
                { sequence: 1, node: "react", payload: { type: "thought", node: "react", summary: "first" }, createdAt: completedAt },
                { sequence: 2, node: "response", payload: { type: "answer", node: "response", text: "second" }, createdAt: completedAt },
            ],
        });
    } finally {
        store.close();
    }
});

test("SQLite request store upgrades existing schemas and validates provider costs", () => {
    withTemporaryDatabase((databasePath) => {
        mkdirSync(dirname(databasePath), { recursive: true });
        const legacy = new DatabaseSync(databasePath);
        legacy.exec(`
            CREATE TABLE requests (
                request_id TEXT PRIMARY KEY NOT NULL,
                user_id TEXT NOT NULL,
                route TEXT,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                status_code INTEGER,
                model_used TEXT,
                prompt_tokens INTEGER,
                latency_ms REAL,
                metrics_json TEXT,
                error_code TEXT
            );
            INSERT INTO requests (request_id, user_id, status, started_at)
            VALUES ('legacy-request', 'operator-1', 'in_progress', '${startedAt}');
        `);
        legacy.close();

        const store = new SqliteRequestTraceStore(databasePath);
        try {
            assert.equal(store.getRequestWithTrace("legacy-request")?.request.providerCost, null);
            store.startRequest({ requestId, userId: "operator-1", startedAt });
            assert.throws(() => store.completeRequest({
                requestId,
                route: "react",
                status: "succeeded",
                completedAt,
                statusCode: 200,
                metrics: { IICalls: 1, latencyMs: 1, providerCost: -0.01 },
                errorCode: null,
                trace: [],
            }));
            store.completeRequest({
                requestId,
                route: "react",
                status: "succeeded",
                completedAt,
                statusCode: 200,
                metrics: { IICalls: 1, latencyMs: 1, modelUsed: "test/model", providerCost: 0.0005 },
                errorCode: null,
                trace: [],
            });
            assert.equal(store.getRequestWithTrace(requestId)?.request.providerCost, 0.0005);
        } finally {
            store.close();
        }
    });
});

test("SQLite request completion rejects duplicate finalization and enforces trace constraints", () => {
    withTemporaryDatabase((databasePath) => {
        const store = new SqliteRequestTraceStore(databasePath);
        store.startRequest({ requestId, userId: "operator-1", startedAt });
        store.completeRequest({
            requestId,
            route: null,
            status: "succeeded",
            completedAt,
            statusCode: 200,
            metrics: null,
            errorCode: null,
            trace: [{ type: "answer", node: "response", text: "done" }],
        });
        assert.throws(() => store.completeRequest({
            requestId,
            route: null,
            status: "succeeded",
            completedAt,
            statusCode: 200,
            metrics: null,
            errorCode: null,
            trace: [],
        }));
        store.close();

        const db = new DatabaseSync(databasePath);
        try {
            db.exec("PRAGMA foreign_keys = ON");
            assert.throws(() => db.prepare(
                "INSERT INTO trace_events (request_id, sequence, node, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
            ).run(requestId, 1, "response", "{}", completedAt));
            assert.throws(() => db.prepare(
                "INSERT INTO trace_events (request_id, sequence, node, payload_json, created_at) VALUES (?, ?, ?, ?, ?)",
            ).run("missing-request", 1, "response", "{}", completedAt));
        } finally {
            db.close();
        }
    });
});

test("SQLite request records survive closing and reopening a file-backed store", () => {
    withTemporaryDatabase((databasePath) => {
        const first = new SqliteRequestTraceStore(databasePath);
        first.startRequest({ requestId, userId: "operator-1", startedAt });
        first.completeRequest({
            requestId,
            route: null,
            status: "succeeded",
            completedAt,
            statusCode: 200,
            metrics: { IICalls: 1, latencyMs: 1 },
            errorCode: null,
            trace: [{ type: "answer", node: "response", text: "done" }],
        });
        first.close();

        const reopened = new SqliteRequestTraceStore(databasePath);
        try {
            assert.equal(reopened.getRequestWithTrace(requestId)?.request.status, "succeeded");
            assert.equal(reopened.getRequestWithTrace(requestId)?.trace[0]?.payload.type, "answer");
        } finally {
            reopened.close();
        }
    });
});

test("SQLite request lookup distinguishes missing records and returns empty traces", () => {
    const store = new SqliteRequestTraceStore(":memory:");
    try {
        store.startRequest({ requestId, userId: "operator-1", startedAt });
        store.completeRequest({
            requestId,
            route: null,
            status: "failed",
            completedAt,
            statusCode: 503,
            metrics: null,
            errorCode: "MODEL_UNAVAILABLE",
            trace: [],
        });
        assert.deepEqual(store.getRequestWithTrace(requestId)?.trace, []);
        assert.equal(store.getRequestWithTrace("unknown"), null);
    } finally {
        store.close();
    }
});

test("SQLite analytics query filters by start time and returns metrics without trace payloads", () => {
    const store = new SqliteRequestTraceStore(":memory:");
    const evaluatedAt = "2026-11-11T12:00:00.000Z";
    try {
        for (const [id, started, status] of [
            ["included-start", "2026-11-10T12:00:00.000Z", "succeeded"],
            ["included-before-end", "2026-11-11T11:59:59.000Z", "in_progress"],
            ["excluded-end", evaluatedAt, "in_progress"],
            ["excluded-before-start", "2026-11-10T11:59:59.999Z", "in_progress"],
        ] as const) {
            store.startRequest({ requestId: id, userId: "operator-1", startedAt: started });
            if (status === "succeeded") {
                store.completeRequest({
                    requestId: id,
                    route: "react",
                    status,
                    completedAt: "2026-11-10T12:00:01.000Z",
                    statusCode: 200,
                    metrics: { IICalls: 1, latencyMs: 1, promptTokens: 3, modelUsed: "provider/model:free" },
                    errorCode: null,
                    trace: [{ type: "answer", node: "response", text: "not loaded" }],
                });
            }
        }
        assert.deepEqual(store.getRequestsInWindow("2026-11-10T12:00:00.000Z", evaluatedAt), [
            {
                requestId: "included-start",
                startedAt: "2026-11-10T12:00:00.000Z",
                status: "succeeded",
                route: "react",
                modelUsed: "provider/model:free",
                promptTokens: 3,
                providerCost: null,
                latencyMs: 1,
            },
            {
                requestId: "included-before-end",
                startedAt: "2026-11-11T11:59:59.000Z",
                status: "in_progress",
                route: null,
                modelUsed: null,
                promptTokens: null,
                providerCost: null,
                latencyMs: null,
            },
        ]);
    } finally {
        store.close();
    }
});
