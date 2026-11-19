import assert from "node:assert/strict";
import test from "node:test";
import { createRunMetrics } from "./metrics.js";

test("counts model starts in an isolated per-run callback", () => {
    const firstRun = createRunMetrics();
    const secondRun = createRunMetrics();

    firstRun.callback.recordCall();
    firstRun.callback.recordCall();

    assert.equal(firstRun.getMetrics().IICalls, 2);
    assert.equal(secondRun.getMetrics().IICalls, 0);
    assert.ok(firstRun.getMetrics().latencyMs >= 0);
});

test("aggregates actual input usage only when every observed model end reports it", () => {
    const complete = createRunMetrics();
    complete.recordUsage({ generations: [[{ message: { usage_metadata: { input_tokens: 7 } } }]], llmOutput: {} });
    complete.recordUsage({ generations: [[{ message: { usage_metadata: { input_tokens: 0 } } }]], llmOutput: {} });
    assert.equal(complete.getMetrics().promptTokens, 7);

    const incomplete = createRunMetrics();
    incomplete.recordUsage({ generations: [[{ message: { usage_metadata: { input_tokens: 5 } } }]], llmOutput: {} });
    incomplete.recordUsage({ generations: [[]], llmOutput: {} });
    assert.equal(incomplete.getMetrics().promptTokens, null);
});

test("aggregates provider-reported costs only when every observed model end reports a valid cost", () => {
    const complete = createRunMetrics();
    complete.recordUsage({
        generations: [[{ message: { response_metadata: { usage: { cost: 0.0007 } } } }]],
        llmOutput: {},
    });
    complete.recordUsage({
        generations: [[{ message: { usage_metadata: { cost: 0 } } }]],
        llmOutput: {},
    });
    assert.equal(complete.getMetrics().providerCost, 0.0007);

    const incomplete = createRunMetrics();
    incomplete.recordUsage({
        generations: [[{ message: { response_metadata: { usage: { cost: 0.0007 } } } }]],
        llmOutput: {},
    });
    incomplete.recordUsage({ generations: [[]], llmOutput: {} });
    assert.equal(incomplete.getMetrics().providerCost, null);

    const invalid = createRunMetrics();
    invalid.recordUsage({
        generations: [[{ message: { response_metadata: { usage: { cost: -1 } } } }]],
        llmOutput: {},
    });
    assert.equal(invalid.getMetrics().providerCost, null);
});

test("accumulates context estimates by source without changing actual usage", () => {
    const run = createRunMetrics();
    run.addSource("request", "request text");
    run.addSource("request", "more");
    run.addSource("history", "history text");
    assert.deepEqual(run.getMetrics().contextBreakdown, { request: 4, history: 3 });
    assert.equal(run.getMetrics().promptTokens, null);
});

test("tracks the successful model candidate and records a fallback transition only after success", () => {
    const run = createRunMetrics();
    const serialized = {} as Parameters<NonNullable<typeof run.callback.handleChatModelStart>>[0];
    run.callback.handleChatModelStart(
        serialized,
        [],
        "primary-run",
        undefined,
        undefined,
        undefined,
        { opsPilotModelId: "provider/primary", opsPilotModelRole: "primary" },
    );
    run.callback.handleLLMEnd({ generations: [], llmOutput: {} }, "primary-run");
    run.callback.handleChatModelStart(
        serialized,
        [],
        "fallback-run",
        undefined,
        undefined,
        undefined,
        {
            opsPilotModelId: "provider/fallback",
            opsPilotModelRole: "fallback",
            opsPilotPrimaryModelId: "provider/primary",
        },
    );
    run.callback.handleLLMEnd({ generations: [], llmOutput: {} }, "fallback-run");

    assert.equal(run.getMetrics().modelUsed, "provider/fallback");
    assert.deepEqual(run.getFallbackEvents("react"), [{
        type: "fallback",
        node: "react",
        from: "provider/primary",
        to: "provider/fallback",
    }]);
});

test("does not report a model or fallback event for a failed model invocation", () => {
    const run = createRunMetrics();
    run.callback.recordModelStart("fallback-run", "provider/fallback", "fallback", "provider/primary");
    run.callback.handleLLMError(new Error("provider unavailable"), "fallback-run");

    assert.equal(run.getMetrics().modelUsed, undefined);
    assert.deepEqual(run.getFallbackEvents("react"), []);
});