import assert from "node:assert/strict";
import test from "node:test";
import type { ReasoningStrategy } from "./reasoning.js";
import { withReflection } from "./reflection.js";

test("approves a response without regenerating when the critic accepts it", async () => {
    let runs = 0;
    const base: ReasoningStrategy = {
        name: "base",
        async run(input) {
            runs += 1;
            return {
                answer: `Answer for ${input.request}`,
                trace: [{ type: "answer", node: "reflection", text: `Answer for ${input.request}` }],
                metrics: { IICalls: 1, latencyMs: 12 },
            };
        },
    };
    const reflected = withReflection(base, {
        maxReflections: 2,
        critic: async ({ answer }) => ({ approved: true, feedback: `Accepted: ${answer}` }),
    });

    const result = await reflected.run({ request: "Check status" });

    assert.equal(runs, 1);
    assert.equal(result.answer, "Answer for Check status");
    assert.ok(result.trace.some(({ type }) => type === "critique"));
    assert.equal(result.metrics.IICalls, 2);
});

test("retries with feedback until the final regeneration is returned after rejection", async () => {
    let runs = 0;
    const base: ReasoningStrategy = {
        name: "base",
        async run(input) {
            runs += 1;
            return {
                answer: `Attempt ${runs} for ${input.request}`,
                trace: [{ type: "answer", node: "reflection", text: `Attempt ${runs} for ${input.request}` }],
                metrics: { IICalls: 1, latencyMs: 5 },
            };
        },
    };
    const reflected = withReflection(base, {
        maxReflections: 2,
        critic: async ({ answer }) => {
            if (answer.includes("Attempt 1")) {
                return { approved: false, feedback: "Fix the wording." };
            }
            return { approved: true, feedback: "Looks good now." };
        },
    });

    test("reflection retains conversation history for the strategy and critic", async () => {
        let strategyHistory: readonly { role: string; content: string }[] = [];
        let critiqueRequest = "";
        const strategy: ReasoningStrategy = {
            name: "fake",
            async run(input) {
                strategyHistory = input.history ?? [];
                return {
                    answer: "Answer using prior context.",
                    trace: [{ type: "answer", node: "reflection", text: "Answer using prior context." }],
                    metrics: { IICalls: 1, latencyMs: 2 },
                };
            },
        };
        const reflected = withReflection(strategy, {
            maxReflections: 1,
            critic: async (input) => {
                critiqueRequest = input.request;
                return { approved: true, feedback: "History supports the answer." };
            },
        });

        await reflected.run({
            request: "What was the alert?",
            history: [{ role: "assistant", content: "Checkout had a firing alert." }],
        });

        assert.deepEqual(strategyHistory, [{ role: "assistant", content: "Checkout had a firing alert." }]);
        assert.match(critiqueRequest, /assistant: Checkout had a firing alert\./);
        assert.match(critiqueRequest, /Current request:\nWhat was the alert\?/);
    });

    const result = await reflected.run({ request: "Write a report" });

    assert.equal(runs, 2);
    assert.equal(result.answer, "Attempt 2 for Write a report\n\nCritical feedback: Fix the wording.");
    assert.equal(result.trace.filter(({ type }) => type === "critique").length, 2);
    assert.equal(result.metrics.IICalls, 4);
});
