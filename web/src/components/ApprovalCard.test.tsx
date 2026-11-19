import "../test-setup.js";
import React from "react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApprovalCard } from "./ApprovalCard.js";

afterEach(() => cleanup());

const proposal = {
    id: "approval-1",
    status: "pending" as const,
    tool: "open_incident" as const,
    arguments: { title: "Checkout errors" },
    description: "Open a sev2 incident for checkout",
    createdAt: "2026-11-12T19:00:00.000Z",
};

test("approval cards keep a failed transport pending and allow an explicit retry", async () => {
    let attempts = 0;
    globalThis.fetch = async () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError("network disconnected");
        return new Response(JSON.stringify({
            approval: {
                id: "approval-1",
                status: "rejected",
                decision: "reject",
                decidedAt: "2026-11-12T19:01:00.000Z",
            },
        }), { status: 200 });
    };
    const user = userEvent.setup();
    render(<ApprovalCard proposal={proposal} />);
    await user.click(screen.getByRole("button", { name: "Rejeitar" }));
    assert.ok(await screen.findByRole("alert"));
    assert.ok(screen.getByRole("button", { name: "Aprovar" }));
    await user.click(screen.getByRole("button", { name: "Rejeitar" }));
    assert.ok(await screen.findByText(/nenhuma alteração foi executada/i));
    assert.equal(attempts, 2);
});
