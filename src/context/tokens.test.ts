import assert from "node:assert/strict";
import test from "node:test";
import { addContextEstimate, estimateTokens, mergeContextBreakdowns } from "./tokens.js";

test("estimateTokens applies floor chars/4 and non-negative boundaries", () => {
    assert.equal(estimateTokens(""), 0);
    assert.equal(estimateTokens("abc"), 0);
    assert.equal(estimateTokens("abcd"), 1);
    assert.equal(estimateTokens(9), 2);
    assert.equal(estimateTokens(-10), 0);
});

test("source estimates accumulate by source and repeated contributions", () => {
    const breakdown = {};
    addContextEstimate(breakdown, "request", "abcdefgh");
    addContextEstimate(breakdown, "request", "ijkl");
    addContextEstimate(breakdown, "history", "");
    assert.deepEqual(breakdown, { request: 3 });
    assert.deepEqual(mergeContextBreakdowns(breakdown, { request: 1, memories: 2 }), { request: 4, memories: 2 });
});
