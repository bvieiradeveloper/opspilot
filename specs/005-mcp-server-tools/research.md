# Research: OpsPilot MCP Server Tools

## MCP SDK API line and compatibility

- **Decision**: Use the `@modelcontextprotocol/sdk` v1 API (`McpServer`, `registerTool`, and `StdioServerTransport`) with Node.js 22 and the repository's Zod 4 dependency.
- **Rationale**: The requested package name is the v1 SDK package; its declared Node engine includes Node 22 and it supports Zod 4. The v1 API aligns with the requested TypeScript ESM project.
- **Alternatives considered**: The newer split-package/v2 API is not compatible with the specifically requested package import path and would require changing the dependency choice.
- **References**: [SDK v1 README](https://github.com/modelcontextprotocol/typescript-sdk/blob/fa56d815aceceb089a695e765c98a83b8ce75421/README.md#L3-L7); [v1 package metadata](https://github.com/modelcontextprotocol/typescript-sdk/blob/fa56d815aceceb089a695e765c98a83b8ce75421/package.json#L9-L35).

## Stdio protocol and diagnostics

- **Decision**: Treat stdout as protocol-only and send startup diagnostics or operational diagnostics to stderr. Do not use `console.log` in the server.
- **Rationale**: The stdio transport carries JSON-RPC messages on stdout; unrelated text corrupts framing and prevents clients from communicating.
- **Alternatives considered**: Logging to stdout is explicitly unsuitable. Suppressing all diagnostics would avoid pollution but obscure startup and operational failures.
- **References**: [MCP SDK stdio guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/9bc40e903fde15534ec06ff4c1347d47000dbe16/docs/serving/stdio.md#L33-L49); [MCP stdio transport specification](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio).

## Process-level integration testing

- **Decision**: Spawn the TypeScript server as a child process and connect using the SDK's `Client` and `StdioClientTransport`. Verify tool discovery and exercise operations against a temporary SQLite file configured through `OPSPILOT_DB`; close the transport and store/process as part of test cleanup.
- **Rationale**: A real subprocess verifies stdio framing, startup, protocol tool discovery, launch configuration, and shutdown. A temporary database avoids production data and live external dependencies.
- **Alternatives considered**: In-process transport tests can check handlers but do not exercise the stdio boundary, so they are not sufficient as the requested server test.
- **References**: [SDK testing guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/9bc40e903fde15534ec06ff4c1347d47000dbe16/docs/testing.md#L118-L134); [SDK stdio end-to-end test](https://github.com/modelcontextprotocol/typescript-sdk/blob/9bc40e903fde15534ec06ff4c1347d47000dbe16/test/e2e/scenarios/stdio.test.ts#L19-L34).

## Shared schemas, operations, and configured state

- **Decision**: Extract/declare the three tool input schemas once alongside the existing agent tools, export and reuse them for MCP registration, and call the existing `OpsStore` operations for results and state changes. Create the store through the existing configured SQLite-store factory.
- **Rationale**: The existing LangChain tools already have Zod inputs and delegate to `OpsStore`; one named schema per operation and one configured store avoid contract and state divergence. The `OPSPILOT_DB` setting enables both entry points to target the same database.
- **Alternatives considered**: Duplicating schemas in the MCP adapter permits them to drift. Creating an independent in-memory store in the adapter would make incidents and alerts disagree with the rest of the application.
- **Repository sources**: `src/agents/tools.ts`, `src/store/ops-store.ts`, and `src/store/sqlite-ops-store.ts`.

## Environment loading and launch command

- **Decision**: Load the project's optional `.env` file through Node's CLI before running `tsx src/mcp/server.ts`; do not add application-level dotenv parsing.
- **Rationale**: The configured store reads `OPSPILOT_DB` from the process environment. Loading the same optional configuration before startup lets the MCP process use the same selected database while preserving the rule against application code reading `.env`.
- **Alternatives considered**: The literal `tsx src/mcp/server.ts` command would not load `.env`, and so could silently select the default database when the existing API is configured to use a different `OPSPILOT_DB`. Requiring `.env` would unnecessarily prevent default-config startup.

## Clarifications

No unresolved technical questions remain.
