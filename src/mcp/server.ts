import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { pathToFileURL } from "node:url";
import { createOpsTools, listAlertsInputSchema, openIncidentInputSchema, resolveIncidentInputSchema } from "../agents/tools.js";
import { createConfiguredSqliteOpsStore } from "../store/sqlite-ops-store.js";

export function createOpsPilotMcpServer(store = createConfiguredSqliteOpsStore()) {
    const server = new McpServer({
        name: "opspilot",
        version: "1.0.0",
    });

    const [listAlertsTool, openIncidentTool, resolveIncidentTool] = createOpsTools(store);

    server.registerTool(
        "list_alerts",
        {
            description: listAlertsTool.description,
            inputSchema: listAlertsInputSchema,
        },
        async (args) => {
            const result = await listAlertsTool.invoke({ status: args?.status ?? "firing" });
            return {
                content: [{ type: "text", text: String(result) }],
            };
        },
    );

    server.registerTool(
        "open_incident",
        {
            description: openIncidentTool.description,
            inputSchema: openIncidentInputSchema,
        },
        async (args) => {
            const result = await openIncidentTool.invoke(args);
            return {
                content: [{ type: "text", text: String(result) }],
            };
        },
    );

    server.registerTool(
        "resolve_incident",
        {
            description: resolveIncidentTool.description,
            inputSchema: resolveIncidentInputSchema,
        },
        async (args) => {
            const result = await resolveIncidentTool.invoke(args);
            return {
                content: [{ type: "text", text: String(result) }],
            };
        },
    );

    return { server, store };
}

async function main() {
    const { server, store } = createOpsPilotMcpServer();

    const closeGracefully = async () => {
        await server.close();
        store.close();
    };

    process.once("SIGINT", () => {
        void closeGracefully();
    });
    process.once("SIGTERM", () => {
        void closeGracefully();
    });
    process.once("exit", () => {
        store.close();
    });

    await server.connect(new StdioServerTransport());
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    void main();
}
