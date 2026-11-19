import assert from "node:assert/strict";
import test from "node:test";
import type { Service } from "../agents/domain.js";
import type { OpsStore } from "../store/ops-store.js";
import { SqliteApprovalStore } from "../store/sqlite-approval-store.js";
import { ApprovalService } from "./approval-service.js";

function fakeOpsStore(shouldFail = false, calls: number[] = []): OpsStore {
    return {
        listServices: () => [{
            id: "svc-checkout",
            name: "checkout-api",
            description: "Customer checkout API",
            tier: "sev1",
        } satisfies Service],
        listAlerts: () => [],
        listIncidents: () => [],
        listRunbooks: () => [],
        openIncident: (input) => {
            calls.push(1);
            if (shouldFail) throw new Error("private store details");
            return { id: "incident-opened", ...input, serviceId: input.service, status: "open" } as never;
        },
        resolveIncident: (id) => {
            calls.push(1);
            if (shouldFail) throw new Error("private store details");
            return { id, status: "resolved" } as never;
        },
        close: () => {},
    };
}

test("approval service stores proposals and executes only after one approved decision", () => {
    const store = new SqliteApprovalStore(":memory:");
    const calls: number[] = [];
    const service = new ApprovalService({ store, operations: fakeOpsStore(false, calls), idFactory: () => "approval-1" });
    try {
        const proposal = service.propose({
            requestId: "request-1",
            conversationId: "conversation-1",
            userId: "operator",
            tool: "open_incident",
            arguments: { title: "Checkout errors", service: "checkout-api", severity: "sev2" },
        });
        assert.equal(proposal.status, "pending");
        assert.match(proposal.description, /checkout-api/);

        const result = service.decide(proposal.id, "operator", "approve");
        assert.equal(result.kind, "completed");
        if (result.kind !== "completed") return;
        assert.equal(result.approval.status, "executed");
        assert.equal(service.decide(proposal.id, "operator", "approve").kind, "completed");
        assert.equal(calls.length, 1);
        assert.equal(service.decide(proposal.id, "operator", "reject").kind, "conflict");
    } finally {
        store.close();
    }
});

test("approval service resolves a unique short service alias before presenting the proposal", () => {
    const store = new SqliteApprovalStore(":memory:");
    const calls: number[] = [];
    const service = new ApprovalService({
        store,
        operations: fakeOpsStore(false, calls),
        idFactory: () => "approval-alias",
    });
    try {
        const proposal = service.propose({
            requestId: "request-alias",
            conversationId: "conversation-alias",
            userId: "operator",
            tool: "open_incident",
            arguments: { title: "Checkout errors", service: "checkout", severity: "sev2" },
        });

        assert.deepEqual(proposal.arguments, {
            title: "Checkout errors",
            service: "checkout-api",
            severity: "sev2",
        });
        assert.match(proposal.description, /for checkout-api:/);

        const result = service.decide(proposal.id, "operator", "approve");
        assert.equal(result.kind, "completed");
        if (result.kind !== "completed") return;
        assert.equal(result.approval.status, "executed");
        assert.equal(calls.length, 1);
    } finally {
        store.close();
    }
});

test("approval service records safe failure and rejects invalid proposals without side effects", () => {
    const store = new SqliteApprovalStore(":memory:");
    const service = new ApprovalService({ store, operations: fakeOpsStore(true), idFactory: () => "approval-2" });
    try {
        assert.throws(() => service.propose({
            requestId: "request-1",
            conversationId: "conversation-1",
            userId: "operator",
            tool: "open_incident",
            arguments: { title: "", service: "checkout-api", severity: "sev2" },
        }));
        const proposal = service.propose({
            requestId: "request-1",
            conversationId: "conversation-1",
            userId: "operator",
            tool: "resolve_incident",
            arguments: { id: "incident-1" },
        });
        const result = service.decide(proposal.id, "operator", "approve");
        assert.equal(result.kind, "completed");
        if (result.kind !== "completed") return;
        assert.equal(result.approval.status, "failed");
        assert.equal(result.approval.errorCode, "ACTION_EXECUTION_FAILED");
        assert.equal(JSON.stringify(result.approval).includes("private store details"), false);
    } finally {
        store.close();
    }
});
