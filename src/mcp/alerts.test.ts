import assert from "node:assert/strict";
import test from "node:test";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import { parseMcpTextResult, withMcpServer } from "./test-utils.js";

test("list_alerts returns the configured store's alerts for default and explicit filters", async () => {
    await withMcpServer(async ({ client, dbPath }) => {
        const store = new SqliteOpsStore(dbPath);
        try {
            const defaultResult = await client.callTool({ name: "list_alerts", arguments: {} });
            const resolvedResult = await client.callTool({ name: "list_alerts", arguments: { status: "resolved" } });
            const allResult = await client.callTool({ name: "list_alerts", arguments: { status: "all" } });

            const defaultAlerts = parseMcpTextResult(defaultResult) as Array<{ status: string }>;
            const resolvedAlerts = parseMcpTextResult(resolvedResult) as Array<{ status: string }>;
            const allAlerts = parseMcpTextResult(allResult) as Array<{ status: string }>;

            assert.equal(defaultAlerts.length, store.listAlerts("firing").length);
            assert.ok(defaultAlerts.every((alert) => alert.status === "firing"));
            assert.equal(resolvedAlerts.length, store.listAlerts("resolved").length);
            assert.ok(resolvedAlerts.every((alert) => alert.status === "resolved"));
            assert.equal(allAlerts.length, store.listAlerts("all").length);
        } finally {
            store.close();
        }
    });
});
