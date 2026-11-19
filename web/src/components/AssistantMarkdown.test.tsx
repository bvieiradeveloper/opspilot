import "../test-setup.js";
import React from "react";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { cleanup, render, screen } from "@testing-library/react";
import { AssistantMarkdown } from "./AssistantMarkdown.js";

afterEach(() => cleanup());

test("assistant Markdown supports GFM while keeping HTML and unsafe links inert", () => {
    const markdown = [
        "## Summary",
        "",
        "- **bold**",
        "",
        "| service | status |",
        "| --- | --- |",
        "| checkout | firing |",
        "",
        "```ts",
        "const safe = true;",
        "```",
        "",
        "<script>alert(1)</script>",
        "",
        "[unsafe](javascript:alert(1))",
    ].join("\n");
    const { container } = render(<AssistantMarkdown content={markdown} />);

    assert.ok(screen.getByRole("heading", { name: "Summary" }));
    assert.ok(screen.getByRole("table"));
    assert.ok(screen.getByText("bold"));
    assert.ok(container.querySelector("pre code"));
    assert.equal(container.querySelector("script"), null);
    assert.equal(container.querySelector("a[href^='javascript:']"), null);
});
