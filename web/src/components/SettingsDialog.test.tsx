import "../test-setup.js";
import React from "react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsDialog } from "./SettingsDialog.js";

afterEach(() => cleanup());

test("settings validate API URL, persist theme, and retain focusable controls", async () => {
    const user = userEvent.setup();
    let saved: unknown;
    let closed = false;
    render(<SettingsDialog
        preferences={{ apiBaseUrl: "http://localhost:3000", theme: "system" }}
        onSave={(value) => { saved = value; }}
        onClose={() => { closed = true; }}
    />);
    await user.clear(screen.getByLabelText("URL base da API"));
    await user.type(screen.getByLabelText("URL base da API"), "https://api.example.com");
    await user.selectOptions(screen.getByLabelText("Tema"), "dark");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    assert.deepEqual(saved, { apiBaseUrl: "https://api.example.com", theme: "dark" });
    assert.equal(closed, true);
});

test("settings dialog dismisses with Escape without saving", async () => {
    const user = userEvent.setup();
    let saved = false;
    let closed = false;
    render(<SettingsDialog
        preferences={{ apiBaseUrl: "http://localhost:3000", theme: "system" }}
        onSave={() => { saved = true; }}
        onClose={() => { closed = true; }}
    />);
    await user.keyboard("{Escape}");
    assert.equal(closed, true);
    assert.equal(saved, false);
});
