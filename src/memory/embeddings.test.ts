import assert from "node:assert/strict";
import test from "node:test";
import { EMBEDDING_DIMENSIONS, createEmbeddingService, type FeatureExtractor } from "./embeddings.js";

test("embedding service initializes once and shares concurrent initialization", async () => {
    let loads = 0;
    let release: ((extractor: FeatureExtractor) => void) | undefined;
    const service = createEmbeddingService(() => {
        loads += 1;
        return new Promise<FeatureExtractor>((resolve) => {
            release = resolve;
        });
    });

    const first = service("first");
    const second = service("second");
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(loads, 1);
    release?.(async () => Float32Array.from({ length: EMBEDDING_DIMENSIONS }, () => 1));
    const [left, right] = await Promise.all([first, second]);
    assert.equal(left.length, EMBEDDING_DIMENSIONS);
    assert.equal(right.length, EMBEDDING_DIMENSIONS);
});

test("embedding service rejects empty text and malformed model output", async () => {
    let calls = 0;
    const service = createEmbeddingService(async () => async () => {
        calls += 1;
        return new Float32Array(2);
    });

    await assert.rejects(service(" "), /must not be empty/);
    assert.equal(calls, 0);
    await assert.rejects(service("valid"), /384 finite values/);
});

test("embedding service retries initialization after a failed model load", async () => {
    let loads = 0;
    const service = createEmbeddingService(async () => {
        loads += 1;
        if (loads === 1) {
            throw new Error("temporary model load failure");
        }
        return async () => new Float32Array(EMBEDDING_DIMENSIONS);
    });

    await assert.rejects(service("first attempt"), /temporary model load failure/);
    assert.equal((await service("second attempt")).length, EMBEDDING_DIMENSIONS);
    assert.equal(loads, 2);
});
