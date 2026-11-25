import assert from "node:assert/strict";
import test from "node:test";
import { UnknownStrategyError } from "../agents/errors.js";
import type { ReasoningStrategy } from "../agents/reasoning.js";
import { createProductionGraph, runProductionGraph } from "./production-graph.js";

function strategy(name: string, calls: string[]): ReasoningStrategy {
    return {
        name,
        async run(input) {
            calls.push(name);
            return {
                answer: `${name}:${input.request}`,
                trace: [{ type: "answer", node: "react", text: `${name}:${input.request}` }],
                metrics: { IICalls: 1, latencyMs: 3 },
            };
        },
    };
}

test("production graph override skips automatic routing and records route trace", async () => {
    const calls: string[] = [];
    let modelCalls = 0;
    const modelFactory = (() => {
        modelCalls += 1;
        throw new Error("automatic router should not run");
    }) as never;
    const graph = createProductionGraph({
        strategies: new Map([["plan-and-execute", strategy("plan-and-execute", calls)]]),
        modelFactory,
    });

    test("production graph explicit team route bypasses automatic routing", async () => {
        const calls: string[] = [];
        let modelCalls = 0;
        const modelFactory = (() => {
            modelCalls += 1;
            throw new Error("explicit team route must not use automatic routing");
        }) as never;
        const graph = createProductionGraph({
            strategies: new Map([["team", strategy("team", calls)]]),
            modelFactory,
        });

        const result = await graph.invoke({
            input: { request: "Investigate the payment incident", userId: "user-1", strategy: "team" },
        });

        assert.equal(modelCalls, 0);
        assert.deepEqual(calls, ["team"]);
        assert.deepEqual(result.trace[0], {
            type: "route",
            node: "router",
            route: "team",
            reason: "Explicit strategy override.",
        });
    });
    const result = await graph.invoke({
        input: { request: "Build plan", userId: "user-1", strategy: "plan-and-execute" },
    });
    assert.equal(modelCalls, 0);
    assert.deepEqual(calls, ["plan-and-execute"]);
    assert.equal(result.trace[0]?.type, "route");
    assert.equal(result.trace[0]?.node, "router");
});

test("production graph rejects unknown overrides before strategy execution", async () => {
    const calls: string[] = [];
    await assert.rejects(
        runProductionGraph(
            { request: "nope", userId: "user-1", strategy: "missing" as never },
            { strategies: new Map([["react", strategy("react", calls)]]) },
        ),
        UnknownStrategyError,
    );
    assert.deepEqual(calls, []);
});

test("automatic routing uses the structured route model result", async () => {
    const calls: string[] = [];
    const modelFactory = (() => ({
        withStructuredOutput: () => ({
            invoke: async () => ({ route: "plan-and-execute", reason: "The request needs a plan." }),
        }),
    })) as never;
    const result = await runProductionGraph(
        { request: "Plan the incident work", userId: "user-1" },
        {
            strategies: new Map([["plan-and-execute", strategy("plan-and-execute", calls)]]),
            modelFactory,
        },
    );
    assert.deepEqual(calls, ["plan-and-execute"]);
    assert.deepEqual(result.trace[0], {
        type: "route",
        node: "router",
        route: "plan-and-execute",
        reason: "The request needs a plan.",
    });
});
