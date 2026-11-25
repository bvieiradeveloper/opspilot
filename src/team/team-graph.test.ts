import assert from "node:assert/strict";
import test from "node:test";
import { createTeamStrategy } from "./team-graph.js";
import type { TeamRole } from "./types.js";

test("team strategy shares analyst findings with the planner and returns the terminal brief", async () => {
    const decisions = [
        { next: "analyst", brief: "Collect current incident facts." },
        { next: "planner", brief: "Plan from verified facts." },
        { next: "executor", brief: "Carry out the approved incident operation." },
        { next: "done", brief: "Incident response recorded." },
    ] as const;
    let decisionIndex = 0;
    const assignments: Array<{ role: TeamRole; brief: string; findings: string[] }> = [];
    const roles = {
        analyst: async ({ brief, blackboard }: { brief: string; blackboard: { findings: string[] } }) => {
            assignments.push({ role: "analyst", brief, findings: [...blackboard.findings] });
            return { findings: ["Payment API latency is elevated."] };
        },
        planner: async ({ brief, blackboard }: { brief: string; blackboard: { findings: string[] } }) => {
            assignments.push({ role: "planner", brief, findings: [...blackboard.findings] });
            return { plan: ["Open a sev2 incident for payment-api."] };
        },
        executor: async ({ brief, blackboard }: { brief: string; blackboard: { findings: string[] } }) => {
            assignments.push({ role: "executor", brief, findings: [...blackboard.findings] });
            return {
                executionResults: [{
                    tool: "open_incident" as const,
                    status: "approval_pending" as const,
                    summary: "Incident proposal is awaiting operator approval.",
                }],
            };
        },
    };
    const strategy = createTeamStrategy({
        supervisor: async () => decisions[decisionIndex++]!,
        roles,
    });

    const result = await strategy.run({ request: "Investigate the payment API incident." });

    assert.equal(result.answer, "Incident response recorded.");
    assert.deepEqual(assignments.map(({ role }) => role), ["analyst", "planner", "executor"]);
    assert.deepEqual(assignments[1]?.findings, ["Payment API latency is elevated."]);
    assert.deepEqual(assignments.map(({ brief }) => brief), [
        "Collect current incident facts.",
        "Plan from verified facts.",
        "Carry out the approved incident operation.",
    ]);
    assert.deepEqual(result.trace.filter((event) => event.type === "handoff").map((event) => [
        event.from,
        event.to,
        event.brief,
    ]), [
        ["supervisor", "analyst", "Collect current incident facts."],
        ["analyst", "planner", "Plan from verified facts."],
        ["planner", "executor", "Carry out the approved incident operation."],
    ]);
});

test("team strategy rejects out-of-scope requests without dispatching a role", async () => {
    let roleCalls = 0;
    const strategy = createTeamStrategy({
        supervisor: async () => ({ next: "out_of_scope", brief: "Team mode handles incident response only." }),
        roles: {
            analyst: async () => { roleCalls += 1; return {}; },
            planner: async () => { roleCalls += 1; return {}; },
            executor: async () => { roleCalls += 1; return {}; },
        },
    });

    const result = await strategy.run({ request: "Write a poem." });

    assert.equal(roleCalls, 0);
    assert.equal(result.answer, "Team mode handles incident response only.");
    assert.equal(result.trace.some((event) => event.type === "handoff"), false);
});

test("team strategy stops at eight handoffs without a ninth supervisor decision", async () => {
    let supervisorCalls = 0;
    let roleCalls = 0;
    let executorCalls = 0;
    const sequence: TeamRole[] = ["analyst", "planner", "executor", "analyst", "planner", "executor", "analyst", "planner"];
    const strategy = createTeamStrategy({
        supervisor: async () => {
            const next = sequence[supervisorCalls];
            supervisorCalls += 1;
            assert.ok(next);
            return { next, brief: `Continue with ${next}.` };
        },
        roles: {
            analyst: async () => { roleCalls += 1; return { findings: [`fact-${roleCalls}`] }; },
            planner: async () => { roleCalls += 1; return { plan: ["Open incident with open_incident."] }; },
            executor: async () => {
                roleCalls += 1;
                executorCalls += 1;
                return {
                    executionResults: [{
                        tool: "open_incident",
                        status: executorCalls === 1 ? "approval_pending" : "completed",
                        summary: executorCalls === 1 ? "Approval is pending." : "Incident opened.",
                    }],
                };
            },
        },
    });

    const result = await strategy.run({ request: "Investigate the payment API incident." });

    assert.equal(supervisorCalls, 8);
    assert.equal(roleCalls, 8);
    assert.equal(result.trace.filter((event) => event.type === "handoff").length, 8);
    assert.match(result.answer, /stopped after eight handoffs/i);
    assert.match(result.answer, /Incident opened/);
    assert.match(result.answer, /Approval is pending/);
});
