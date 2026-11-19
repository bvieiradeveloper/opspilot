import "../test-setup.js";
import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiRequestError } from "./chat-api.js";
import { decideApproval } from "./approval-api.js";

test("approval client validates the decision response and uses the configured endpoint", async () => {
    let url = "";
    let payload: unknown;
    const result = await decideApproval("approval-1", "reject", "https://api.example.com", async (input, init) => {
        url = String(input);
        payload = JSON.parse(String(init?.body));
        return new Response(JSON.stringify({
            approval: {
                id: "approval-1",
                status: "rejected",
                decision: "reject",
                decidedAt: "2026-11-12T19:01:00.000Z",
                completedAt: null,
            },
        }), { status: 200 });
    });
    assert.equal(url, "https://api.example.com/approvals/approval-1");
    assert.deepEqual(payload, { decision: "reject" });
    assert.equal(result.status, "rejected");
});

test("approval client rejects mismatched confirmations and explicit HTTP failures", async () => {
    await assert.rejects(() => decideApproval("approval-1", "approve", "https://api.example.com", async () => new Response(JSON.stringify({
        approval: {
            id: "approval-2",
            status: "executed",
            decision: "approve",
            decidedAt: "2026-11-12T19:01:00.000Z",
            completedAt: "2026-11-12T19:02:00.000Z",
        },
    }), { status: 200 })), ApiRequestError);
    await assert.rejects(() => decideApproval("approval-1", "approve", "https://api.example.com", async () => new Response("{}", { status: 409 })), /HTTP 409/);
});
