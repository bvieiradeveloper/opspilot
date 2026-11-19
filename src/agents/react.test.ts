import assert from "node:assert/strict";
import test from "node:test";
import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { messagesToTrace } from "./react.js";

test("converts ReAct tool calls, observations, and final answer without exposing thoughts", () => {
    const messages = [
        new HumanMessage("List firing alerts"),
        new AIMessage({
            content: "private internal reasoning must not appear",
            tool_calls: [{ id: "call-1", name: "list_alerts", args: { status: "firing" } }],
        }),
        new ToolMessage({ content: "[{\"id\":\"alert-001\"}]", tool_call_id: "call-1", name: "list_alerts" }),
        new AIMessage("One firing alert is critical."),
    ];

    const trace = messagesToTrace(messages);

    assert.deepEqual(trace.map(({ type }) => type), ["action", "observation", "answer"]);
    assert.equal(trace[0].type, "action");
    assert.equal(trace[2].type, "answer");
    assert.doesNotMatch(JSON.stringify(trace), /private internal reasoning/);
});