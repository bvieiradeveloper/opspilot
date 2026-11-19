import assert from "node:assert/strict";
import test from "node:test";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import { getSeedSummary } from "./seed.js";

test("seed summary reports the canonical SQLite dataset deterministically", () => {
    const first = new SqliteOpsStore(":memory:");
    const second = new SqliteOpsStore(":memory:");
    try {
        assert.deepEqual(getSeedSummary(first), {
            services: 5,
            alerts: 6,
            firing: 3,
            resolved: 3,
        });
        assert.deepEqual(getSeedSummary(first), getSeedSummary(second));
    } finally {
        first.close();
        second.close();
    }
});