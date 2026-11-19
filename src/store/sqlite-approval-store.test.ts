import assert from "node:assert/strict";
import test from "node:test";
import { SqliteApprovalStore } from "./sqlite-approval-store.js";

const pendingInput = {
    id: "approval-1",
    requestId: "request-1",
    conversationId: "conversation-1",
    userId: "operator",
    tool: "open_incident" as const,
    arguments: { title: "Checkout failure", service: "checkout-api", severity: "sev2" as const },
    description: "Open a sev2 incident for checkout-api: Checkout failure",
    createdAt: "2026-11-12T12:00:00.000Z",
};

test("approval store atomically rejects or claims a pending decision and persists outcomes", () => {
    const store = new SqliteApprovalStore(":memory:");
    try {
        store.createPending(pendingInput);
        const rejected = store.claimDecision("approval-1", "operator", "reject", new Date("2026-11-12T12:01:00.000Z"));
        assert.equal(rejected.kind, "claimed");
        if (rejected.kind !== "claimed") return;
        assert.equal(rejected.approval.status, "rejected");
        assert.equal(rejected.approval.result, null);

        store.createPending({ ...pendingInput, id: "approval-2", tool: "resolve_incident", arguments: { id: "incident-1" } });
        const approved = store.claimDecision("approval-2", "operator", "approve", new Date("2026-11-12T12:02:00.000Z"));
        assert.equal(approved.kind, "claimed");
        if (approved.kind !== "claimed") return;
        assert.equal(approved.approval.status, "executing");
        assert.equal(store.claimDecision("approval-2", "operator", "approve", new Date()).kind, "existing");
        assert.equal(store.claimDecision("approval-2", "operator", "reject", new Date()).kind, "conflict");
        store.complete("approval-2", "executed", { id: "incident-1" }, null, new Date("2026-11-12T12:03:00.000Z"));
        const completed = store.get("approval-2");
        assert.equal(completed?.status, "executed");
        assert.deepEqual(completed?.result, { id: "incident-1" });
        assert.equal(store.claimDecision("approval-2", "operator", "approve", new Date()).kind, "existing");
    } finally {
        store.close();
    }
});

test("approval store hides unknown and foreign records and validates proposals", () => {
    const store = new SqliteApprovalStore(":memory:");
    try {
        store.createPending(pendingInput);
        assert.equal(store.claimDecision("missing", "operator", "approve", new Date()).kind, "not_found");
        assert.equal(store.claimDecision("approval-1", "other-user", "approve", new Date()).kind, "not_found");
        assert.throws(() => store.createPending({
            ...pendingInput,
            id: "approval-invalid",
            arguments: { title: "", service: "checkout-api", severity: "sev2" },
        }));
    } finally {
        store.close();
    }
});
