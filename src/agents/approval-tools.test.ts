import assert from "node:assert/strict";
import test from "node:test";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import { createApprovalAwareTools } from "./approval-tools.js";

test("approval-aware tools propose incident changes while read-only tools remain automatic", async () => {
    const store = new SqliteOpsStore(":memory:");
    const proposals: Array<{ tool: string; args: Record<string, unknown> }> = [];
    try {
        const tools = createApprovalAwareTools(store, (proposal) => proposals.push({
            tool: proposal.tool,
            args: proposal.arguments,
        }));
        const open = tools.find((candidate) => candidate.name === "open_incident");
        const list = tools.find((candidate) => candidate.name === "list_alerts");
        assert.ok(open);
        assert.ok(list);
        await open.invoke({ title: "Checkout failure", service: "checkout-api", severity: "sev2" });
        assert.equal(store.listIncidents("all").length, 0);
        assert.deepEqual(proposals, [{
            tool: "open_incident",
            args: { title: "Checkout failure", service: "checkout-api", severity: "sev2" },
        }]);
        const before = store.listAlerts("all").length;
        await list.invoke({ status: "all" });
        assert.equal(store.listAlerts("all").length, before);
    } finally {
        store.close();
    }
});
