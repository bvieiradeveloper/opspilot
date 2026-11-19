import "../test-setup.js";
import React from "react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChatMessage } from "../models/chat.js";
import { MessageList } from "./MessageList.js";

afterEach(() => cleanup());

test("trace panel preserves event order and displays trace values literally", async () => {
    const messages: ChatMessage[] = [{
        id: "assistant-1",
        role: "assistant",
        content: "Answer",
        status: "complete",
        trace: [
            { type: "thought", node: "react", summary: "Checking <b>alert</b>" },
            { type: "action", node: "react", tool: "list_alerts", args: { status: "firing" } },
            { type: "observation", node: "react", result: { count: 2 } },
            { type: "answer", node: "react", text: "Answer" },
            { type: "route", node: "router", route: "react", reason: "selected" },
            { type: "new-event", node: "future", value: "<script>bad()</script>" },
        ],
    }];
    const user = userEvent.setup();
    render(<MessageList messages={messages} onRetry={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Ver raciocínio/ }));

    const headings = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);
    assert.deepEqual(headings, ["1. Pensamento", "2. Ação", "3. Observação", "4. Resposta", "5. route", "6. new-event"]);
    assert.ok(screen.getByText("Checking <b>alert</b>"));
    assert.ok(screen.getByText(/"count": 2/));
    assert.ok(screen.getByText(/<script>bad\(\)<\/script>/));
});

test("Escape closes the trace panel and restores focus to its opener", async () => {
    const user = userEvent.setup();
    render(<MessageList
        messages={[{ id: "a", role: "assistant", content: "Answer", status: "complete", trace: [] }]}
        onRetry={() => {}}
    />);
    const opener = screen.getByRole("button", { name: /Ver raciocínio/ });
    await user.click(opener);
    assert.ok(screen.getByRole("dialog", { name: "Auditoria da resposta" }));
    await user.keyboard("{Escape}");
    await waitFor(() => assert.equal(document.activeElement, opener));
});
