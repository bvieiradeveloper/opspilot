import assert from "node:assert/strict";
import test from "node:test";
import { deterministicStrategy, withRequestTracingServer } from "./request-tracing-test-utils.js";
import { SqliteRequestTraceStore } from "../store/sqlite-request-trace-store.js";

test("GET /states returns overall request analytics for the requested or default window", async () => {
    await withRequestTracingServer(new Map([["react", deterministicStrategy()]]), async (baseUrl, { requests }) => {
        requests.startRequest({
            requestId: "analytics-request",
            userId: "operator-1",
            startedAt: new Date(Date.now() - 60_000).toISOString(),
        });
        requests.completeRequest({
            requestId: "analytics-request",
            route: "react",
            status: "succeeded",
            completedAt: new Date().toISOString(),
            statusCode: 200,
            metrics: {
                IICalls: 1,
                latencyMs: 50,
                modelUsed: "provider/model:free",
                promptTokens: 12,
            },
            errorCode: null,
            trace: [],
        });
        requests.startRequest({
            requestId: "analytics-unknown",
            userId: "operator-1",
            startedAt: new Date(Date.now() - 30_000).toISOString(),
        });

        const response = await fetch(`${baseUrl}/states?since=24h`);
        assert.equal(response.status, 200);
        const body = await response.json() as {
            since: string;
            overall: {
                totalRequests: number;
                errorRequests: number;
                tokens: { total: number; measuredRequests: number };
                cost: { total: number; measuredRequests: number; unavailableRequests: number };
                latency: { p50Ms: number | null; p95Ms: number | null };
            };
            byRoute: Array<{ route: string | null; totalRequests: number }>;
            byModel: Array<{ model: string | null; totalRequests: number }>;
        };
        assert.equal(body.since, "24h");
        assert.deepEqual(body.overall, {
            totalRequests: 2,
            errorRequests: 0,
            tokens: { total: 12, measuredRequests: 1 },
            cost: { currency: "USD", total: 0, measuredRequests: 1, unavailableRequests: 1 },
            latency: { sampleCount: 1, p50Ms: 50, p95Ms: 50 },
        });
        assert.deepEqual(body.byRoute.map(({ route, totalRequests }) => ({ route, totalRequests })), [
            { route: "react", totalRequests: 1 },
            { route: null, totalRequests: 1 },
        ]);
        assert.deepEqual(body.byModel.map(({ model, totalRequests }) => ({ model, totalRequests })), [
            { model: "provider/model:free", totalRequests: 1 },
            { model: null, totalRequests: 1 },
        ]);

        const defaultWindow = await fetch(`${baseUrl}/states`);
        assert.equal(defaultWindow.status, 200);
        assert.equal((await defaultWindow.json() as { since: string }).since, "24h");
    });
});

test("GET /states rejects invalid, repeated, and over-limit since values", async () => {
    await withRequestTracingServer(new Map([["react", deterministicStrategy()]]), async (baseUrl) => {
        for (const query of ["since=0h", "since=31d", "since=24h&since=1h", "since=1s"]) {
            const response = await fetch(`${baseUrl}/states?${query}`);
            assert.equal(response.status, 400, query);
            assert.ok(Array.isArray((await response.json() as { issues: unknown[] }).issues));
        }
    });
});

test("GET /states reports storage failures through the existing error middleware", async () => {
    const store = new SqliteRequestTraceStore(":memory:");
    store.getRequestsInWindow = () => {
        throw new Error("Database details are not part of this response.");
    };
    await withRequestTracingServer(
        new Map([["react", deterministicStrategy()]]),
        async (baseUrl) => {
            const response = await fetch(`${baseUrl}/states`);
            assert.equal(response.status, 500);
            assert.deepEqual(await response.json(), {
                error: {
                    code: "INTERNAL_ERROR",
                    message: "The request could not be completed.",
                },
            });
        },
        { requestTraceStore: store },
    );
});
