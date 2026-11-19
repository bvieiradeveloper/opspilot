import assert from "node:assert/strict";
import test from "node:test";
import { createJsonLineLogger } from "../obs/logger.js";
import { SqliteRequestTraceStore } from "../store/sqlite-request-trace-store.js";
import { RequestTracingService } from "./request-tracing-service.js";

test("request tracing service persists successful metrics and trace with generated ID", () => {
    const store = new SqliteRequestTraceStore(":memory:");
    const lines: string[] = [];
    const service = new RequestTracingService({
        store,
        logger: createJsonLineLogger((line) => lines.push(line)),
        idFactory: () => "request-1",
        clock: () => new Date("2026-11-11T12:00:00.000Z"),
    });
    try {
        const requestId = service.start("operator-1");
        assert.equal(store.getRequestWithTrace(requestId)?.request.status, "in_progress");
        service.succeed(requestId, { IICalls: 1, latencyMs: 10, promptTokens: 5, modelUsed: "test/model" }, [
            { type: "route", node: "router", route: "react", reason: "explicit" },
            { type: "answer", node: "response", text: "done" },
        ]);
        assert.equal(store.getRequestWithTrace(requestId)?.request.status, "succeeded");
        assert.equal(store.getRequestWithTrace(requestId)?.request.userId, "operator-1");
        assert.equal(store.getRequestWithTrace(requestId)?.request.route, "react");
        assert.equal(store.getRequestWithTrace(requestId)?.request.modelUsed, "test/model");
        assert.equal(store.getRequestWithTrace(requestId)?.request.promptTokens, 5);
        assert.deepEqual(store.getRequestWithTrace(requestId)?.request.metrics, {
            IICalls: 1,
            latencyMs: 10,
            promptTokens: 5,
            modelUsed: "test/model",
        });
        assert.equal(store.getRequestWithTrace(requestId)?.trace[1]?.payload.text, "done");
        assert.equal(lines.length, 2);
        assert.equal(JSON.parse(lines[0]!).requestId, requestId);
        assert.equal(JSON.parse(lines[1]!).outcome, "succeeded");
        assert.equal(JSON.parse(lines[1]!).route, "react");
        assert.equal(JSON.parse(lines[1]!).promptTokens, 5);
        assert.equal(lines.some((line) => line.includes("done")), false);
    } finally {
        store.close();
    }
});

test("request tracing service persists failures and timeouts with safe status codes", () => {
    const store = new SqliteRequestTraceStore(":memory:");
    const service = new RequestTracingService({
        store,
        logger: createJsonLineLogger(() => {}),
        idFactory: (() => {
            let current = 0;
            return () => `request-${++current}`;
        })(),
    });
    try {
        const failedId = service.start("operator-1");
        service.fail(failedId, 503, "MODEL_UNAVAILABLE");
        const timedOutId = service.start("operator-1");
        service.timeout(timedOutId);

        assert.equal(store.getRequestWithTrace(failedId)?.request.status, "failed");
        assert.equal(store.getRequestWithTrace(failedId)?.request.errorCode, "MODEL_UNAVAILABLE");
        assert.equal(store.getRequestWithTrace(timedOutId)?.request.status, "timed_out");
        assert.equal(store.getRequestWithTrace(timedOutId)?.request.statusCode, 504);
    } finally {
        store.close();
    }
});
