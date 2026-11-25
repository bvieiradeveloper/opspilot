import assert from "node:assert/strict";
import test from "node:test";
import {
    incidentBlackboardSchema,
    supervisorDecisionSchema,
    teamRoleSchema,
    teamRunStateSchema,
} from "./types.js";

test("team schemas validate role names, non-empty context, and handoff limits", () => {
    assert.deepEqual(teamRoleSchema.options, ["analyst", "planner", "executor"]);
    assert.equal(incidentBlackboardSchema.safeParse({
        request: "Investigate the payment incident",
        findings: [],
        plan: [],
        executionResults: [],
        openQuestions: [],
    }).success, true);
    assert.equal(incidentBlackboardSchema.safeParse({
        request: " ",
        findings: [],
        plan: [],
        executionResults: [],
        openQuestions: [],
    }).success, false);

    for (const next of ["analyst", "planner", "executor", "done", "out_of_scope"] as const) {
        assert.equal(supervisorDecisionSchema.safeParse({ next, brief: "Continue from current findings." }).success, true);
    }
    assert.equal(supervisorDecisionSchema.safeParse({ next: "analyst", brief: " " }).success, false);

    const state = (handoffCount: number) => ({
        request: "Investigate the payment incident",
        currentRole: null,
        handoffCount,
        blackboard: {
            request: "Investigate the payment incident",
            findings: [],
            plan: [],
            executionResults: [],
            openQuestions: [],
        },
        answer: "",
        outcome: "running",
    });
    for (const handoffCount of [0, 8]) {
        assert.equal(teamRunStateSchema.safeParse(state(handoffCount)).success, true);
    }
    for (const handoffCount of [-1, 9]) {
        assert.equal(teamRunStateSchema.safeParse(state(handoffCount)).success, false);
    }
});
