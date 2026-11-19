import assert from "node:assert/strict";
import test from "node:test";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import { parseMcpTextResult, withMcpServer } from "./test-utils.js";

test("open_incident and resolve_incident update the same SQLite store and reject invalid operations", async () => {
    await withMcpServer(async ({ client, dbPath }) => {
        const store = new SqliteOpsStore(dbPath);
        try {
            const opened = await client.callTool({
                name: "open_incident",
                arguments: {
                    title: "Payment latency",
                    service: "payments-api",
                    severity: "sev1",
                },
            });
            const openedIncident = parseMcpTextResult(opened) as { id: string; status: string };

            assert.equal(openedIncident.status, "open");
            assert.equal(store.listIncidents("all").find((incident) => incident.id === openedIncident.id)?.status, "open");

            const resolved = await client.callTool({
                name: "resolve_incident",
                arguments: { id: openedIncident.id },
            });
            const resolvedIncident = parseMcpTextResult(resolved) as { id: string; status: string };

            assert.equal(resolvedIncident.status, "resolved");
            assert.equal(store.listIncidents("all").find((incident) => incident.id === openedIncident.id)?.status, "resolved");

            const invalid = await client.callTool({
                name: "open_incident",
                arguments: {
                    title: "",
                    service: "payments-api",
                    severity: "sev2",
                },
            });
            assert.equal(invalid.isError, true);

            const missing = await client.callTool({
                name: "resolve_incident",
                arguments: { id: "missing-incident" },
            });
            assert.equal(missing.isError, true);
        } finally {
            store.close();
        }
    });
});
