import assert from "node:assert/strict";
import test from "node:test";
import { formatTrace } from "./trace.js";
import type { TraceEvent } from "./reasoning.js";

const events: TraceEvent[] = [
    { type: "fallback", node: "react", from: "provider/primary", to: "provider/fallback" },
    { type: "thought", node: "test", summary: "Checking alert status" },
    { type: "plan", node: "test", steps: ["List firing alerts", "Summarize highest severity"] },
    { type: "action", node: "test", tool: "list_alerts", args: { status: "firing" } },
    { type: "observation", node: "test", result: [{ id: "alert-001" }] },
    { type: "critique", node: "test", summary: "One alert requires attention" },
    { type: "answer", node: "test", text: "One critical alert is firing." },
];

test("formats all trace event types in their original order", () => {
    const formatted = formatTrace(events);

    assert.deepEqual(
        ["fallback", "thought", "plan", "action", "observation", "critique", "answer"].map((type) => formatted.indexOf(type)),
        [...["fallback", "thought", "plan", "action", "observation", "critique", "answer"].map((type) => formatted.indexOf(type))].sort((a, b) => a - b),
    );
    assert.match(formatted, /fallback@react: provider\/primary -> provider\/fallback/);
    assert.match(formatted, /list_alerts.*status.*firing/);
    assert.match(formatted, /One critical alert is firing\./);
});

test("does not serialize untrusted extra fields from thought summaries", () => {
    const event = { type: "thought", node: "test", summary: "Safe summary", privateReasoning: "must not render" } as unknown as TraceEvent;
    const formatted = formatTrace([event]);

    assert.match(formatted, /Safe summary/);
    assert.doesNotMatch(formatted, /must not render/);
});

test("formats nested action arguments with deterministic key order", () => {
    const formatted = formatTrace([{
        type: "action",
        node: "react",
        tool: "list_alerts",
        args: { status: "firing", filter: { z: 1, a: 2 } },
    }]);

    assert.match(formatted, /\{"filter":\{"a":2,"z":1\},"status":"firing"\}/);
});