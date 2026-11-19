import assert from "node:assert/strict";
import test from "node:test";
import { createOpsStore } from "./store.js";
import { createOpsTools } from "./tools.js";
import { createPlanAndExecuteStrategy } from "./plan-and-execute.js";

test("executes one planned tool and replans before returning a typed result", async () => {
    const store = createOpsStore();
    let planCalls = 0;
    let replanCalls = 0;
    const strategy = createPlanAndExecuteStrategy({
        tools: createOpsTools(store),
        planner: async () => {
            planCalls += 1;
            return { steps: [{ tool: "list_alerts", args: { status: "firing" } }] };
        },
        replanner: async () => {
            replanCalls += 1;
            return { steps: [], done: true, answer: "Three firing alerts found.", critique: "The alert list answers the request." };
        },
    });

    test("includes prior conversation history in the planner request without changing the current request", async () => {
        let plannerRequest = "";
        const strategy = createPlanAndExecuteStrategy({
            tools: createOpsTools(createOpsStore()),
            planner: async ({ request }) => {
                plannerRequest = request;
                return { steps: [], answer: "Context received." };
            },
            replanner: async () => ({ steps: [], done: true, answer: "done", critique: "done" }),
        });

        await strategy.run({
            request: "What did we find?",
            history: [
                { role: "user", content: "Check checkout alerts." },
                { role: "assistant", content: "There are two firing alerts." },
            ],
        });

        assert.match(plannerRequest, /user: Check checkout alerts\./);
        assert.match(plannerRequest, /assistant: There are two firing alerts\./);
        assert.match(plannerRequest, /Current request:\nWhat did we find\?/);
    });

    const result = await strategy.run({ request: "List firing alerts" });

    assert.equal(result.answer, "Three firing alerts found.");
    assert.equal(planCalls, 1);
    assert.equal(replanCalls, 1);
    assert.equal(result.metrics.IICalls, 2);
    assert.ok(result.metrics.latencyMs >= 0);
    assert.deepEqual(result.trace.map(({ type }) => type), ["plan", "action", "observation", "critique", "answer"]);
    assert.equal(result.trace[1].type, "action");
    if (result.trace[1].type === "action") {
        assert.equal(result.trace[1].tool, "list_alerts");
        assert.deepEqual(result.trace[1].args, { status: "firing" });
    }
});

test("replans after each action and stops at the configured iteration cap", async () => {
    let replans = 0;
    const strategy = createPlanAndExecuteStrategy({
        tools: createOpsTools(createOpsStore()),
        planner: async () => ({
            steps: [
                { tool: "list_alerts", args: { status: "firing" } },
                { tool: "list_alerts", args: { status: "resolved" } },
            ],
        }),
        replanner: async () => {
            replans += 1;
            return {
                steps: [{ tool: "list_alerts", args: { status: "resolved" } }],
                done: false,
                answer: "Stopped at the requested limit.",
                critique: "One planned step was completed.",
            };
        },
    });

    const result = await strategy.run({ request: "Inspect alerts", maxIterations: 1 });

    assert.equal(replans, 1);
    assert.equal(result.trace.filter(({ type }) => type === "action").length, 1);
    assert.equal(result.answer, "Stopped at the requested limit.");
});

test("executes the initial plan without calling the replanner when disabled", async () => {
    const store = createOpsStore();
    let replannerCalls = 0;
    const strategy = createPlanAndExecuteStrategy({
        store,
        useReplanner: false,
        planner: async () => ({
            steps: [
                { tool: "open_incident", args: { title: "Checkout", service: "checkout-api", severity: "sev2" } },
                { tool: "open_incident", args: { title: "Payments", service: "payments-api", severity: "sev2" } },
            ],
            answer: "Planned incidents opened.",
        }),
        replanner: async () => {
            replannerCalls += 1;
            throw new Error("Replanner should not run.");
        },
    });

    const result = await strategy.run({ request: "Open two incidents" });

    assert.equal(replannerCalls, 0);
    assert.equal(result.metrics.IICalls, 1);
    assert.equal(result.answer, "Planned incidents opened.");
    assert.deepEqual(store.listIncidents().map(({ serviceId }) => serviceId), ["svc-checkout", "svc-payments"]);
});

test("rejects plans with more than eight steps", async () => {
    const strategy = createPlanAndExecuteStrategy({
        tools: createOpsTools(createOpsStore()),
        planner: async () => ({
            steps: Array.from({ length: 9 }, () => ({ tool: "list_alerts", args: { status: "all" } })),
        }),
        replanner: async () => ({ steps: [], done: true, answer: "done", critique: "done" }),
    });

    await assert.rejects(() => strategy.run({ request: "Inspect alerts" }));
});

test("plans and executes incident-list and service-runbook tools", async () => {
    const store = createOpsStore();
    const strategy = createPlanAndExecuteStrategy({
        tools: createOpsTools(store),
        planner: async () => ({
            steps: [
                { tool: "list_incidents", args: { status: "open" } },
                { tool: "consultar_runbooks", args: { service: "checkout-api" } },
            ],
        }),
        replanner: async ({ completed }) => completed.length === 1
            ? {
                steps: [{ tool: "consultar_runbooks", args: { service: "checkout-api" } }],
                done: false,
                answer: "Checking the checkout runbook.",
                critique: "The requested runbook still needs to be checked.",
            }
            : {
                steps: [],
                done: true,
                answer: "No open incidents; the checkout runbook is available.",
                critique: "Both requested operational lookups completed.",
            },
    });

    const result = await strategy.run({ request: "Check checkout incidents and guidance" });

    assert.deepEqual(
        result.trace.filter(({ type }) => type === "action").map(({ type, ...event }) => event),
        [
            { node: "plan-and-execute", tool: "list_incidents", args: { status: "open" } },
            { node: "plan-and-execute", tool: "consultar_runbooks", args: { service: "checkout-api" } },
        ],
    );
});

test("plans and executes a provider status check", async () => {
    const store = createOpsStore();
    const strategy = createPlanAndExecuteStrategy({
        tools: createOpsTools(store, async () => new Response(JSON.stringify({
            status: { indicator: "none", description: "All systems operational" },
        }), { status: 200 })),
        planner: async () => ({
            steps: [{ tool: "check_provider_status", args: { provider: "github" } }],
        }),
        replanner: async ({ completed }) => ({
            steps: [],
            done: true,
            answer: String(completed[0]?.result),
            critique: "The public provider status has been checked.",
        }),
    });

    const result = await strategy.run({ request: "Is this a provider issue?" });
    assert.match(result.answer, /github is none - All systems operational/);
    assert.ok(result.trace.some((event) => event.type === "action" && event.tool === "check_provider_status"));
});

test("plans and executes forget_preference with request-scoped memory operations", async () => {
    let forgottenPreference = "";
    const strategy = createPlanAndExecuteStrategy({
        tools: createOpsTools(createOpsStore()),
        planner: async () => ({
            steps: [{ tool: "forget_preference", args: { preference: "critical alert order" } }],
        }),
        replanner: async ({ completed }) => ({
            steps: [],
            done: true,
            answer: JSON.stringify(completed[0]?.result),
            critique: "The preference removal outcome was checked.",
        }),
    });

    const result = await strategy.run({
        request: "Forget my preference about critical alert order.",
        memoryOperations: {
            list: () => [],
            async remember(fact) {
                return { id: "memory-1", fact, createdAt: "2026-10-21T22:00:00.000Z" };
            },
            async forget(preference) {
                forgottenPreference = preference;
                return {
                    forgotten: true,
                    needsClarification: false,
                    candidates: [{ id: "memory-1", fact: "Prefers critical alerts first." }],
                };
            },
        },
    });

    assert.equal(forgottenPreference, "critical alert order");
    assert.ok(result.trace.some((event) => event.type === "action"
        && event.tool === "forget_preference"
        && event.args.preference === "critical alert order"));
    const toolResult = JSON.parse(result.answer) as string;
    assert.equal(JSON.parse(toolResult).forgotten, true);
});