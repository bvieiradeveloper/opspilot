import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createChatApp } from "./server.js";
import type { ReasoningStrategy } from "../agents/reasoning.js";
import type { OpsStore } from "../store/ops-store.js";
import { SqliteApprovalStore } from "../store/sqlite-approval-store.js";
import { SqliteConversationStore } from "../store/sqlite-conversation-store.js";
import { SqliteChatIdempotencyStore } from "../store/sqlite-chat-idempotency-store.js";
import { SqliteRequestTraceStore } from "../store/sqlite-request-trace-store.js";
import { EMBEDDING_DIMENSIONS } from "../memory/embeddings.js";
import { SqliteMemoryStore } from "../memory/memory-store.js";
import { ApprovalService } from "../services/approval-service.js";

test("War Room chat persists proposals and approval decisions are safe and idempotent", async () => {
    let mutations = 0;
    let proposalRuns = 0;
    const operations: OpsStore = {
        listServices: () => [],
        listAlerts: () => [],
        listIncidents: () => [],
        listRunbooks: () => [],
        openIncident: (input) => {
            mutations += 1;
            return { id: "incident-1", ...input, serviceId: input.service, status: "open" } as never;
        },
        resolveIncident: (id) => {
            mutations += 1;
            return { id, status: "resolved" } as never;
        },
        close: () => {},
    };
    const approvals = new SqliteApprovalStore(":memory:");
    const service = new ApprovalService({ store: approvals, operations, idFactory: (() => {
        let next = 0;
        return () => `approval-${++next}`;
    })() });
    const strategy: ReasoningStrategy = {
        name: "react",
        async run() {
            return {
                answer: "Waiting for authorization.",
                trace: [
                    { type: "action", node: "react", tool: "open_incident", args: { title: "Checkout errors", service: "checkout-api", severity: "sev2" } },
                    { type: "answer", node: "react", text: "Waiting for authorization." },
                ],
                metrics: { IICalls: 1, latencyMs: 1 },
            };
        },
    };
    const conversations = new SqliteConversationStore(":memory:");
    const memories = new SqliteMemoryStore(":memory:", {
        embed: async () => new Float32Array(EMBEDDING_DIMENSIONS),
    });
    const traces = new SqliteRequestTraceStore(":memory:");
    const idempotency = new SqliteChatIdempotencyStore(":memory:");
    const server = createServer(createChatApp({
        conversationStore: conversations,
        memoryStore: memories,
        requestTraceStore: traces,
        chatIdempotencyStore: idempotency,
        warRoomConfig: { userId: "operator", webOrigins: ["http://localhost:5173"] },
        approvalService: service,
        warRoomStrategiesFactory: (onProposal) => {
            const warRoomStrategy: ReasoningStrategy = {
                ...strategy,
                async run(input) {
                    proposalRuns += 1;
                    onProposal({
                        tool: "open_incident",
                        arguments: { title: input.request, service: "checkout-api", severity: "sev2" },
                    });
                    return strategy.run(input);
                },
            };
            return new Map([[warRoomStrategy.name, warRoomStrategy]]);
        },
        logger: { info: () => {} },
    }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
        const chatResponse = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json", "Idempotency-Key": "proposal-1" },
            body: JSON.stringify({ message: "Open checkout incident" }),
        });
        assert.equal(chatResponse.status, 202);
        const pendingResponse = await chatResponse.json() as {
            requestId: string;
            conversationId: string;
            answer: string;
            trace: unknown[];
            metrics: Record<string, unknown>;
            approvals: Array<{ id: string; status: string }>;
        };
        const pending = pendingResponse;
        assert.equal(pending.approvals.length, 1);
        assert.equal(pending.approvals[0]?.status, "pending");
        assert.equal(mutations, 0);
        const chatReplay = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json", "Idempotency-Key": "proposal-1" },
            body: JSON.stringify({ message: "Open checkout incident" }),
        });
        assert.equal(chatReplay.status, 202);
        assert.deepEqual(await chatReplay.json(), pendingResponse);

        const rejected = await fetch(`${baseUrl}/approvals/${pending.approvals[0]?.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision: "reject" }),
        });
        assert.equal(rejected.status, 200);
        assert.equal((await rejected.json() as { approval: { status: string } }).approval.status, "rejected");
        const replay = await fetch(`${baseUrl}/approvals/${pending.approvals[0]?.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision: "reject" }),
        });
        assert.equal(replay.status, 200);
        assert.equal(mutations, 0);

        const conflict = await fetch(`${baseUrl}/approvals/${pending.approvals[0]?.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision: "approve" }),
        });
        assert.equal(conflict.status, 409);

        assert.equal(proposalRuns, 1);
        const nextChat = await fetch(`${baseUrl}/chat`, {
            method: "POST",
            headers: { "content-type": "application/json", "Idempotency-Key": "proposal-2" },
            body: JSON.stringify({ message: "Open another checkout incident" }),
        });
        const nextPending = await nextChat.json() as { approvals: Array<{ id: string }> };
        const approved = await fetch(`${baseUrl}/approvals/${nextPending.approvals[0]?.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision: "approve" }),
        });
        assert.equal(approved.status, 200);
        assert.equal((await approved.json() as { approval: { status: string } }).approval.status, "executed");
        const approvedReplay = await fetch(`${baseUrl}/approvals/${nextPending.approvals[0]?.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision: "approve" }),
        });
        assert.equal(approvedReplay.status, 200);
        assert.equal(mutations, 1);

        const invalid = await fetch(`${baseUrl}/approvals/${nextPending.approvals[0]?.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision: "later" }),
        });
        assert.equal(invalid.status, 400);

        const unknown = await fetch(`${baseUrl}/approvals/unknown`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision: "approve" }),
        });
        assert.equal(unknown.status, 404);

        const alreadyExecuting = service.propose({
            requestId: "request-executing",
            conversationId: "conversation-executing",
            userId: "operator",
            tool: "open_incident",
            arguments: { title: "Existing operation", service: "checkout-api", severity: "sev2" },
        });
        approvals.claimDecision(alreadyExecuting.id, "operator", "approve", new Date());
        const executing = await fetch(`${baseUrl}/approvals/${alreadyExecuting.id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision: "approve" }),
        });
        assert.equal(executing.status, 202);
        assert.equal(executing.headers.get("retry-after"), "2");
        assert.equal((await executing.json() as { approval: { status: string } }).approval.status, "executing");
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
        approvals.close();
        conversations.close();
        memories.close();
        traces.close();
        idempotency.close();
    }
});

test("approval endpoint returns a safe 500 when decision persistence fails", async () => {
    const approvals = new SqliteApprovalStore(":memory:");
    approvals.claimDecision = () => {
        throw new Error("sensitive persistence details");
    };
    const service = new ApprovalService({
        store: approvals,
        operations: {
            listServices: () => [],
            listAlerts: () => [],
            listIncidents: () => [],
            listRunbooks: () => [],
            openIncident: () => {
                throw new Error("Unexpected incident operation.");
            },
            resolveIncident: () => {
                throw new Error("Unexpected incident operation.");
            },
            close: () => {},
        },
    });
    const conversations = new SqliteConversationStore(":memory:");
    const memories = new SqliteMemoryStore(":memory:", {
        embed: async () => new Float32Array(EMBEDDING_DIMENSIONS),
    });
    const traces = new SqliteRequestTraceStore(":memory:");
    const server = createServer(createChatApp({
        conversationStore: conversations,
        memoryStore: memories,
        requestTraceStore: traces,
        warRoomConfig: { userId: "operator", webOrigins: ["http://localhost:5173"] },
        approvalService: service,
        logger: { info: () => {} },
    }));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    try {
        const response = await fetch(`${baseUrl}/approvals/approval-1`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ decision: "approve" }),
        });
        assert.equal(response.status, 500);
        assert.deepEqual(await response.json(), {
            error: {
                code: "INTERNAL_ERROR",
                message: "The request could not be completed.",
            },
        });
    } finally {
        await new Promise<void>((resolve, reject) => {
            server.close((error) => error ? reject(error) : resolve());
        });
        approvals.close();
        conversations.close();
        memories.close();
        traces.close();
    }
});
