import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type McpTestContext = {
    client: Client;
    dbPath: string;
    stderrText: () => string;
};

export async function withMcpServer<T>(run: (context: McpTestContext) => Promise<T>): Promise<T> {
    const tempDir = mkdtempSync(join(tmpdir(), "opspilot-mcp-"));
    const dbPath = join(tempDir, "opspilot.db");
    const transport = new StdioClientTransport({
        command: process.execPath,
        args: ["--no-warnings", "--import", "tsx", "src/mcp/server.ts"],
        env: { ...process.env, OPSPILOT_DB: dbPath },
        cwd: process.cwd(),
        stderr: "pipe",
    });
    const client = new Client({ name: "test-client", version: "1.0.0" });
    const stderrChunks: string[] = [];
    const stderrStream = transport.stderr;
    if (stderrStream) {
        stderrStream.on("data", (chunk) => {
            stderrChunks.push(String(chunk));
        });
    }

    await client.connect(transport);

    try {
        return await run({
            client,
            dbPath,
            stderrText: () => stderrChunks.join(""),
        });
    } finally {
        await client.close();
        await transport.close();
        rmSync(tempDir, { recursive: true, force: true });
    }
}

export function parseMcpTextResult(result: unknown): unknown {
    if (typeof result !== "object" || result === null || !("content" in result)) {
        return undefined;
    }

    const content = (result as { content?: unknown[] }).content;
    if (!Array.isArray(content)) {
        return undefined;
    }

    const entry = content.find((item) => typeof item === "object" && item !== null && "type" in item && "text" in item && item.type === "text" && typeof item.text === "string");
    if (!entry || typeof entry !== "object" || !("text" in entry) || typeof entry.text !== "string") {
        return undefined;
    }
    return JSON.parse(entry.text);
}
