import assert from "node:assert/strict";
import test from "node:test";
import { createJsonLineLogger } from "./logger.js";

test("JSON Lines logger emits one parseable metadata record for each event", () => {
    const lines: string[] = [];
    const logger = createJsonLineLogger((line) => lines.push(line));

    logger.info({
        timestamp: "2026-11-11T12:00:00.000Z",
        event: "request.completed",
        requestId: "request-1",
        node: "response",
        route: "react",
        outcome: "succeeded",
        statusCode: 200,
        durationMs: 42,
        promptTokens: 9,
    });

    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]!), {
        level: "info",
        timestamp: "2026-11-11T12:00:00.000Z",
        event: "request.completed",
        requestId: "request-1",
        node: "response",
        route: "react",
        outcome: "succeeded",
        statusCode: 200,
        durationMs: 42,
        promptTokens: 9,
    });
});

test("JSON Lines logger drops payload-bearing and unknown fields", () => {
    const lines: string[] = [];
    const logger = createJsonLineLogger((line) => lines.push(line));

    logger.info({
        event: "request.completed",
        requestId: "request-1",
        payload: "sensitive prompt",
        message: "private message",
        userId: "private-user",
        answer: "private answer",
        args: { token: "secret" },
        result: "private tool output",
        error: new Error("sensitive exception"),
    } as Parameters<typeof logger.info>[0]);

    assert.equal(lines.length, 1);
    const line = lines[0]!;
    const record = JSON.parse(line) as Record<string, unknown>;
    assert.equal(record.requestId, "request-1");
    for (const secret of ["sensitive prompt", "private message", "private-user", "private answer", "secret", "private tool output", "sensitive exception"]) {
        assert.equal(line.includes(secret), false);
    }
});
