import assert from "node:assert/strict";
import test from "node:test";
import { runArena, type ArenaIO } from "./arena.js";
import { ModelConfigurationError } from "./agents/model.js";
import type { ReasoningStrategy } from "./agents/reasoning.js";

function createIO(): ArenaIO & { stdout: string[]; stderr: string[] } {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return {
        stdout,
        stderr,
        writeOut: (text) => stdout.push(text),
        writeError: (text) => stderr.push(text),
    };
}

test("runs selected strategies sequentially with the same request and iteration limit", async () => {
    const calls: Array<{ name: string; request: string; maxIterations?: number }> = [];
    const strategies: ReasoningStrategy[] = ["first", "second"].map((name) => ({
        name,
        async run(input) {
            calls.push({ name, ...input });
            return {
                answer: `answer from ${name}`,
                trace: [{ type: "answer", node: "test", text: `answer from ${name}` }],
                metrics: { IICalls: name === "first" ? 2 : 1, latencyMs: 10 },
            };
        },
    }));
    const io = createIO();

    const exitCode = await runArena(
        ["--strategies", "second,first", "--max-iterations", "3", "List", "alerts"],
        strategies,
        io,
    );

    assert.equal(exitCode, 0);
    assert.deepEqual(calls, [
        { name: "second", request: "List alerts", maxIterations: 3 },
        { name: "first", request: "List alerts", maxIterations: 3 },
    ]);
    assert.match(io.stdout[0], /second/);
    assert.match(io.stdout[1], /first/);
    assert.ok(io.stdout.every((line) => /IICalls/.test(line)));
});

test("rejects invalid arguments and unknown strategies before invoking a strategy", async () => {
    let invoked = false;
    const strategy: ReasoningStrategy = {
        name: "react",
        async run() {
            invoked = true;
            throw new Error("must not invoke");
        },
    };
    const missingRequestIO = createIO();
    assert.equal(await runArena(["--max-iterations", "9"], [strategy], missingRequestIO), 1);
    assert.equal(invoked, false);
    assert.ok(missingRequestIO.stderr.length > 0);

    const unknownIO = createIO();
    assert.equal(await runArena(["--strategies", "missing", "request"], [strategy], unknownIO), 1);
    assert.equal(invoked, false);
});

test("continues other selected strategies after one strategy fails", async () => {
    const strategies: ReasoningStrategy[] = [
        { name: "broken", async run() { throw new Error("safe failure"); } },
        {
            name: "react",
            async run() {
                return { answer: "ok", trace: [{ type: "answer", node: "test", text: "ok" }], metrics: { IICalls: 1, latencyMs: 1 } };
            },
        },
    ];
    const io = createIO();

    assert.equal(await runArena(["request"], strategies, io), 1);
    assert.match(io.stderr[0], /broken/);
    assert.match(io.stdout[0], /react/);
});

test("reports missing model configuration without hiding it", async () => {
    const strategy: ReasoningStrategy = {
        name: "react",
        async run() {
            throw new ModelConfigurationError();
        },
    };
    const io = createIO();

    assert.equal(await runArena(["request"], [strategy], io), 1);
    assert.match(io.stderr[0], /OPENROUTER_API_KEY and OPENROUTER_MODEL must be configured/);
});