import assert from "node:assert/strict";
import test from "node:test";
import { RunnableLambda } from "@langchain/core/runnables";
import { FakeListChatModel } from "@langchain/core/utils/testing";
import { ModelUnavailableError } from "./errors.js";
import { createModel, createModelCandidates, createResilientRunnable } from "./model.js";
import { createRunMetrics } from "./metrics.js";

test("requires the explicit OpenRouter environment settings", () => {
    assert.throws(() => createModel({}), /OPENROUTER_API_KEY.*OPENROUTER_MODEL|OPENROUTER_MODEL.*OPENROUTER_API_KEY/);
});

test("constructs one zero-temperature OpenRouter-compatible client", () => {
    const model = createModel({
        OPENROUTER_API_KEY: "test-key-not-used-for-network",
        OPENROUTER_MODEL: "test/model",
    });

    assert.equal(model.model, "test/model");
    assert.equal(model.temperature, 0);
    assert.equal(model.clientConfig.baseURL, "https://openrouter.ai/api/v1");
});

test("accepts an optional fallback model and treats blank configuration as absent", () => {
    const candidates = createModelCandidates({
        OPENROUTER_API_KEY: "test-key-not-used-for-network",
        OPENROUTER_MODEL: "test/primary",
        OPENROUTER_MODEL_FALLBACK: " test/fallback ",
    });

    assert.equal(candidates.primaryModelId, "test/primary");
    assert.equal(candidates.fallbackModelId, "test/fallback");
    assert.equal(candidates.fallback?.model, "test/fallback");
    assert.equal(createModelCandidates({
        OPENROUTER_API_KEY: "test-key-not-used-for-network",
        OPENROUTER_MODEL: "test/primary",
        OPENROUTER_MODEL_FALLBACK: "   ",
    }).fallback, undefined);
});

test("returns the primary result without invoking its fallback", async () => {
    let primaryCalls = 0;
    let fallbackCalls = 0;
    const resilient = createResilientRunnable(
        RunnableLambda.from(async () => {
            primaryCalls += 1;
            return "primary result";
        }),
        RunnableLambda.from(async () => {
            fallbackCalls += 1;
            return "fallback result";
        }),
        { primaryModelId: "test/primary", fallbackModelId: "test/fallback" },
    );

    assert.equal(await resilient.invoke("request"), "primary result");
    assert.equal(primaryCalls, 1);
    assert.equal(fallbackCalls, 0);
});

test("propagates candidate metadata to the per-run chat callback", async () => {
    const metrics = createRunMetrics();
    const resilient = createResilientRunnable(
        new FakeListChatModel({ responses: ["primary result"] }),
        undefined,
        { primaryModelId: "provider/primary" },
    );

    await resilient.invoke("request", { callbacks: [metrics.callback] });

    assert.equal(metrics.getMetrics().modelUsed, "provider/primary");
});

test("retries the primary twice, then retries the fallback twice before succeeding", async () => {
    const calls: string[] = [];
    const resilient = createResilientRunnable(
        RunnableLambda.from(async () => {
            calls.push("primary");
            throw new Error("primary unavailable");
        }),
        RunnableLambda.from(async () => {
            calls.push("fallback");
            if (calls.filter((call) => call === "fallback").length === 1) {
                throw new Error("fallback transient failure");
            }
            return "fallback result";
        }),
        { primaryModelId: "test/primary", fallbackModelId: "test/fallback" },
    );

    assert.equal(await resilient.invoke("request"), "fallback result");
    assert.deepEqual(calls, ["primary", "primary", "fallback", "fallback"]);
});

test("raises a safe model-unavailable error when all attempts fail", async () => {
    const resilient = createResilientRunnable(
        RunnableLambda.from(async () => { throw new Error("private primary provider detail"); }),
        RunnableLambda.from(async () => { throw new Error("private fallback provider detail"); }),
        { primaryModelId: "test/primary", fallbackModelId: "test/fallback" },
    );

    await assert.rejects(resilient.invoke("request"), (error: unknown) => {
        assert.ok(error instanceof ModelUnavailableError);
        assert.doesNotMatch(error.message, /private|provider detail/);
        return true;
    });
});