import assert from "node:assert/strict";
import test from "node:test";
import { deterministicStrategy, withRequestTracingServer } from "./request-tracing-test-utils.js";

test("POST /chat returns and persists one matching request ID", async () => {
    const strategy = deterministicStrategy();
    await withRequestTracingServer(new Map([["react", strategy]]), async (baseUrl, { requests }) => {
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "Check service status", userId: "test-user" }),
        });
        const body = await response.json() as { requestId: string; metrics: { IICalls: number } };
        assert.equal(response.status, 200);
        assert.equal(body.requestId, response.headers.get("x-request-id"));
        assert.equal(body.metrics.IICalls, 1);
        const persisted = requests.getRequestWithTrace(body.requestId);
        assert.equal(persisted?.request.status, "succeeded");
        assert.equal(persisted?.request.userId, "test-user");
        assert.equal(persisted?.request.route, "react");
        assert.equal(persisted?.request.metrics?.IICalls, 1);
        assert.equal(persisted?.request.promptTokens, 0);
        assert.deepEqual(persisted?.trace.map(({ sequence }) => sequence), [1, 2, 3]);
    });
});

test("POST /chat gives separate requests distinct request IDs", async () => {
    await withRequestTracingServer(new Map([["react", deterministicStrategy()]]), async (baseUrl) => {
        const ids: string[] = [];
        for (let index = 0; index < 2; index += 1) {
            const response = await fetch(`${baseUrl}/chat`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: `Request ${index}`, userId: "test-user" }),
            });
            ids.push((await response.json() as { requestId: string }).requestId);
        }
        assert.notEqual(ids[0], ids[1]);
    });
});

test("GET /request/:id returns ordered trace and rejects unknown or malformed IDs", async () => {
    await withRequestTracingServer(new Map([["react", deterministicStrategy()]]), async (baseUrl, { requests }) => {
        requests.startRequest({
            requestId: "stored-request",
            userId: "operator-1",
            startedAt: "2026-11-11T12:00:00.000Z",
        });
        requests.completeRequest({
            requestId: "stored-request",
            route: "react",
            status: "succeeded",
            completedAt: "2026-11-11T12:00:01.000Z",
            statusCode: 200,
            metrics: { IICalls: 1, latencyMs: 1 },
            errorCode: null,
            trace: [
                { type: "thought", node: "react", summary: "first" },
                { type: "answer", node: "response", text: "second" },
            ],
        });

        const response = await fetch(`${baseUrl}/request/stored-request`);
        const body = await response.json() as {
            request: { requestId: string; userId: string; route: string | null };
            trace: Array<{ sequence: number }>;
        };
        assert.equal(response.status, 200);
        assert.equal(body.request.requestId, "stored-request");
        assert.equal(body.request.userId, "operator-1");
        assert.equal(body.request.route, "react");
        assert.deepEqual(body.trace.map(({ sequence }) => sequence), [1, 2]);

        const pluralResponse = await fetch(`${baseUrl}/requests/stored-request`);
        assert.equal(pluralResponse.status, 404);

        requests.startRequest({
            requestId: "empty-trace-request",
            userId: "operator-1",
            startedAt: "2026-11-11T12:00:00.000Z",
        });
        requests.completeRequest({
            requestId: "empty-trace-request",
            route: null,
            status: "failed",
            completedAt: "2026-11-11T12:00:01.000Z",
            statusCode: 503,
            metrics: null,
            errorCode: "MODEL_UNAVAILABLE",
            trace: [],
        });
        const emptyTrace = await fetch(`${baseUrl}/request/empty-trace-request`);
        assert.equal(emptyTrace.status, 200);
        assert.deepEqual((await emptyTrace.json() as { trace: unknown[] }).trace, []);

        const missing = await fetch(`${baseUrl}/request/not-found`);
        assert.equal(missing.status, 404);
        assert.equal((await missing.json() as { error: { code: string } }).error.code, "REQUEST_NOT_FOUND");
        const malformed = await fetch(`${baseUrl}/request/%20`);
        assert.equal(malformed.status, 400);
    });
});

test("POST /chat persists rejected strategy status and returns request ID header", async () => {
    await withRequestTracingServer(new Map([["react", deterministicStrategy()]]), async (baseUrl, { requests }) => {
        const response = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: "Check status", userId: "test-user", strategy: "unknown" }),
        });
        const requestId = response.headers.get("x-request-id");
        assert.equal(response.status, 422);
        assert.ok(requestId);
        assert.equal(requests.getRequestWithTrace(requestId)?.request.status, "failed");
        assert.equal(requests.getRequestWithTrace(requestId)?.request.errorCode, "UNKNOWN_STRATEGY");
    });
});

test("POST /chat records timeout outcomes", async () => {
    const slowStrategy = {
        ...deterministicStrategy(),
        async run() {
            await new Promise((resolve) => setTimeout(resolve, 50));
            return { answer: "late", trace: [], metrics: { IICalls: 1, latencyMs: 50 } };
        },
    };
    await withRequestTracingServer(
        new Map([["react", slowStrategy]]),
        async (baseUrl, { requests }) => {
            const response = await fetch(`${baseUrl}/chat`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ message: "Slow request", userId: "test-user" }),
            });
            const requestId = response.headers.get("x-request-id")!;
            assert.equal(response.status, 504);
            assert.equal(requests.getRequestWithTrace(requestId)?.request.status, "timed_out");
        },
        { requestTimeoutMs: 5 },
    );
});
