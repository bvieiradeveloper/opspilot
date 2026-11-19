# Quickstart: OpsPilot MCP Server Tools

This guide validates the server through an MCP client and a real stdio subprocess. It does not require production data or external services.

## Prerequisites

- Node.js 22 LTS and npm.
- Project dependencies installed.
- A writable temporary directory for an isolated SQLite database.
- No production credentials are required.

## Automated validation

1. Run the MCP server integration test:

   ```powershell
   node --import tsx --test src/mcp/server.test.ts
   ```

   The test launches the server as a child process with an isolated `OPSPILOT_DB`, connects using the MCP stdio client, checks the `opspilot` server identity and exact tool list, invokes the tools against the temporary store, and closes the client and process.

2. Run the project type check:

   ```powershell
   npm run typecheck
   ```

3. Run the complete test suite:

   ```powershell
   npm test
   ```

## Manual startup

Start the stdio server from the repository root:

```powershell
npm run mcp
```

The launch command loads an optional `.env` before starting TypeScript so an `OPSPILOT_DB` setting can select the same database used by the API. The MCP client, rather than a terminal prompt, must own stdin/stdout when manually checking protocol behavior.

## Expected results

- The client discovers server `opspilot` and exactly `list_alerts`, `open_incident`, and `resolve_incident`.
- `list_alerts` returns the configured store's matching alerts; an empty result is valid.
- A valid incident creation is visible through the same store; resolving it changes that incident to `resolved`.
- Invalid or impossible operations produce explicit tool failures.
- No diagnostic or non-protocol content appears on stdout; any diagnostic output is on stderr.

See [the MCP tool contract](./contracts/mcp-tools.md) and [the data model](./data-model.md) for input and state details.
