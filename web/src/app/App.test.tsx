import "../test-setup.js";
import React from "react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App.js";

afterEach(() => cleanup());

test("application exposes semantic landmarks and accessible settings", async () => {
    const user = userEvent.setup();
    render(<App />);
    assert.ok(screen.getByRole("main"));
    assert.ok(screen.getByRole("region", { name: "War Room" }));
    const gear = screen.getByRole("button", { name: "Abrir configurações" });
    await user.click(gear);
    assert.ok(screen.getByRole("dialog", { name: "Configurações" }));
    await user.selectOptions(screen.getByLabelText("Tema"), "dark");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    assert.equal(document.documentElement.dataset.theme, "dark");
    await user.click(gear);
    await user.keyboard("{Escape}");
    await waitFor(() => assert.equal(document.activeElement, gear));
});

test("invalid saved settings are visible and block the chat until corrected", async () => {
    localStorage.setItem("opspilot.war-room.preferences", JSON.stringify({
        apiBaseUrl: "https://api.example.com/?invalid=true",
        theme: "system",
    }));
    render(<App />);
    assert.ok(screen.getByRole("alert"));
    assert.equal(screen.queryByLabelText("Mensagem"), null);
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("URL base da API"));
    await user.type(screen.getByLabelText("URL base da API"), "http://localhost:3000");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    assert.ok(screen.getByLabelText("Mensagem"));
});
