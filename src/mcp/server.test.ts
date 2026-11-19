import assert from "node:assert/strict";
import test from "node:test";
import { withMcpServer } from "./test-utils.js";

test("MCP server advertises the OpsPilot server name and exactly the three operational tools", async () => {
    await withMcpServer(async ({ client, stderrText }) => {
        assert.equal(client.getServerVersion()?.name, "opspilot");

        const { tools } = await client.listTools();
        const names = tools.map((tool) => tool.name).sort();

        assert.deepEqual(names, ["list_alerts", "open_incident", "resolve_incident"]);
        assert.equal(stderrText(), "");
    });
});
