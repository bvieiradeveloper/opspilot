import assert from "node:assert/strict";
import test from "node:test";
import { createApprovalAwareTools } from "../agents/approval-tools.js";
import { createOpsStore } from "../agents/store.js";
import { createWarRoomTeamToolSets } from "./index.js";

test("team tools enforce read-only analyst, tool-free planner, and approval-aware executor", async () => {
    const store = createOpsStore();
    const proposals: unknown[] = [];
    try {
        const tools = createWarRoomTeamToolSets(store, (proposal) => proposals.push(proposal));
        assert.deepEqual(tools.analyst.map(({ name }) => name).sort(), [
            "check_provider_status",
            "consultar_runbooks",
            "list_alerts",
            "list_incidents",
        ]);
        assert.deepEqual(tools.planner, []);
        assert.deepEqual(tools.executor.map(({ name }) => name).sort(), ["open_incident", "resolve_incident"]);

        const approvalAwareOpenIncident = createApprovalAwareTools(store, (proposal) => proposals.push(proposal))[1];
        const result = JSON.parse(String(await approvalAwareOpenIncident.invoke({
            title: "Payment API latency",
            service: "payments-api",
            severity: "sev2",
        }))) as { status: string };
        assert.equal(result.status, "approval_required");
        assert.equal(proposals.length, 1);
        assert.deepEqual(store.listIncidents(), []);
    } finally {
        store.close();
    }
});
