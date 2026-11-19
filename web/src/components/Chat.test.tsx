import "../test-setup.js";
import React from "react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Chat } from "./Chat.js";

afterEach(() => {
    cleanup();
});

const result = {
    requestId: "request-1",
    conversationId: "conversation-1",
    answer: "A **safe** answer.",
    trace: [{ type: "answer", node: "react", text: "A safe answer." }],
    metrics: { IICalls: 1, latencyMs: 1, promptTokens: null, contextBreakdown: {}, historyMessages: 0 },
};

test("chat shows an empty state and renders an assistant answer once", async () => {
    globalThis.fetch = async () => new Response(JSON.stringify(result), { status: 200 });
    const user = userEvent.setup();
    render(<Chat />);

    assert.ok(screen.getByText("Comece uma investigação"));
    await user.type(screen.getByLabelText("Mensagem"), "List alerts");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    assert.ok(await screen.findByText("safe"));
    assert.equal(screen.getAllByText("List alerts").length, 1);
    assert.equal(screen.getAllByText("safe").length, 1);
});

test("failed chat retry reuses its key and does not duplicate the submitted message", async () => {
    const keys: string[] = [];
    let attempts = 0;
    globalThis.fetch = async (_input, init) => {
        keys.push((init?.headers as Record<string, string>)["Idempotency-Key"] ?? "");
        attempts += 1;
        if (attempts === 1) throw new TypeError("network disconnected");
        return new Response(JSON.stringify(result), { status: 200 });
    };
    const user = userEvent.setup();
    render(<Chat />);
    await user.type(screen.getByLabelText("Mensagem"), "Check checkout");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByRole("button", { name: "Tentar novamente" });
    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => assert.equal(screen.getAllByText("Check checkout").length, 1));
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1]);
    assert.ok(screen.getByText("safe"));
});

test("chat announces loading and blocks concurrent submissions", async () => {
    let finish!: (response: Response) => void;
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        return new Promise<Response>((resolve) => { finish = resolve; });
    };
    const user = userEvent.setup();
    render(<Chat />);
    const field = screen.getByLabelText("Mensagem");
    await user.type(field, "Check alerts");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    assert.ok(screen.getByText("Processando sua solicitação…"));

    const form = field.closest("form");
    assert.ok(form);
    fireEvent.submit(form);
    assert.equal(calls, 1);
    assert.equal(screen.getAllByText("Check alerts").length, 1);

    await act(async () => finish(new Response(JSON.stringify(result), { status: 200 })));
    assert.ok(await screen.findByText("safe"));
});
