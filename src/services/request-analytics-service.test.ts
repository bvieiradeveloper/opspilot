import assert from "node:assert/strict";
import test from "node:test";
import type { RequestAnalyticsRecord } from "../store/request-trace-store.js";
import { requestAnalyticsQuerySchema, RequestAnalyticsService } from "./request-analytics-service.js";

const evaluatedAt = new Date("2026-11-11T12:00:00.000Z");
const rows: RequestAnalyticsRecord[] = [
    {
        requestId: "start-boundary",
        startedAt: "2026-11-10T12:00:00.000Z",
        status: "succeeded",
        route: "react",
        modelUsed: "provider/model:free",
        promptTokens: 10,
        providerCost: 0.0009,
        latencyMs: 100,
    },
    {
        requestId: "paid-request",
        startedAt: "2026-11-11T11:00:00.000Z",
        status: "failed",
        route: null,
        modelUsed: "provider/model:paid",
        promptTokens: null,
        providerCost: 0.01,
        latencyMs: 400,
    },
    {
        requestId: "in-progress",
        startedAt: "2026-11-11T11:59:59.000Z",
        status: "in_progress",
        route: null,
        modelUsed: null,
        promptTokens: null,
        providerCost: null,
        latencyMs: null,
    },
];

test("analytics query accepts positive minute/hour/day durations up to 30 days", () => {
    for (const since of ["1m", "24h", "30d"]) {
        assert.equal(requestAnalyticsQuerySchema.safeParse({ since }).success, true);
    }
    for (const since of ["", "0h", "-1h", "31d", "1s", "24h "]) {
        assert.equal(requestAnalyticsQuerySchema.safeParse({ since }).success, false);
    }
    assert.equal(requestAnalyticsQuerySchema.safeParse({ since: ["24h", "1h"] }).success, false);
});

test("request analytics computes overall counts, known usage and nearest-rank percentiles", () => {
    const service = new RequestAnalyticsService({
        store: {
            getRequestsInWindow: (startsAt, endsAt) => rows.filter(
                (row) => row.startedAt >= startsAt && row.startedAt < endsAt,
            ),
        },
        clock: () => evaluatedAt,
    });

    const summary = service.getSummary({ since: "24h" });
    assert.equal(summary.since, "24h");
    assert.equal(summary.evaluatedAt, evaluatedAt.toISOString());
    assert.deepEqual(summary.overall, {
        totalRequests: 3,
        errorRequests: 1,
        tokens: { total: 10, measuredRequests: 1 },
        cost: { currency: "USD", total: 0.01, measuredRequests: 2, unavailableRequests: 1 },
        latency: { sampleCount: 2, p50Ms: 100, p95Ms: 400 },
    });
});

test("request analytics defaults to 24h and returns empty-window aggregates", () => {
    const service = new RequestAnalyticsService({
        store: { getRequestsInWindow: () => [] },
        clock: () => evaluatedAt,
    });

    assert.deepEqual(service.getSummary({}), {
        since: "24h",
        evaluatedAt: evaluatedAt.toISOString(),
        overall: {
            totalRequests: 0,
            errorRequests: 0,
            tokens: { total: 0, measuredRequests: 0 },
            cost: { currency: "USD", total: 0, measuredRequests: 0, unavailableRequests: 0 },
            latency: { sampleCount: 0, p50Ms: null, p95Ms: null },
        },
        byRoute: [],
        byModel: [],
    });
});

test("request analytics groups by route and model, including unknowns that reconcile", () => {
    const service = new RequestAnalyticsService({
        store: {
            getRequestsInWindow: (startsAt, endsAt) => rows.filter(
                (row) => row.startedAt >= startsAt && row.startedAt < endsAt,
            ),
        },
        clock: () => evaluatedAt,
    });
    const summary = service.getSummary({ since: "24h" });

    assert.deepEqual(summary.byRoute.map(({ route, totalRequests, errorRequests, tokens, cost }) => ({
        route,
        totalRequests,
        errorRequests,
        tokens,
        cost,
    })), [
        {
            route: "react",
            totalRequests: 1,
            errorRequests: 0,
            tokens: { total: 10, measuredRequests: 1 },
            cost: { currency: "USD", total: 0, measuredRequests: 1, unavailableRequests: 0 },
        },
        {
            route: null,
            totalRequests: 2,
            errorRequests: 1,
            tokens: { total: 0, measuredRequests: 0 },
            cost: { currency: "USD", total: 0.01, measuredRequests: 1, unavailableRequests: 1 },
        },
    ]);
    assert.deepEqual(summary.byModel.map(({ model, totalRequests }) => ({ model, totalRequests })), [
        { model: "provider/model:free", totalRequests: 1 },
        { model: "provider/model:paid", totalRequests: 1 },
        { model: null, totalRequests: 1 },
    ]);
    assert.equal(summary.byRoute.reduce((total, group) => total + group.totalRequests, 0), summary.overall.totalRequests);
    assert.equal(summary.byModel.reduce((total, group) => total + group.tokens.total, 0), summary.overall.tokens.total);
});
