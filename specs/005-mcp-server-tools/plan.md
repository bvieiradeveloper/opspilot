# Implementation Plan: OpsPilot MCP Server Tools

**Branch**: `005-mcp-server-tools` | **Date**: 2026-10-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-mcp-server-tools/spec.md`

## Summary

Expose the existing alert-listing and incident-management operations through an `opspilot` MCP server over stdio. Reuse the configured `OpsStore`, the existing operation behavior, and shared Zod input schemas so the LangChain and MCP interfaces cannot drift. Keep stdout exclusively for protocol traffic, load the existing optional `.env` before startup so both application entry points can target the same configured SQLite database, and verify discovery and operations with an SDK client connected to a real server subprocess.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS  
**Primary Dependencies**: `@modelcontextprotocol/sdk` v1 API, Zod 4, `tsx`; existing Express/LangChain dependencies remain unchanged  
**Storage**: Existing configured SQLite `OpsStore` (`OPSPILOT_DB`, otherwise `./data/opspilot.db`); no new persistence layer  
**Testing**: `node:test` through `tsx`; MCP SDK client and stdio transport for process-level integration  
**Target Platform**: Node.js 22 process launched by an MCP-compatible local client  
**Project Type**: TypeScript ESM backend service with an additional stdio protocol adapter  
**Performance Goals**: Tool discovery and local store calls complete without avoidable transport delays; no separate latency target is specified for this local adapter  
**Constraints**: stdout is protocol-only; diagnostics go to stderr; all external tool arguments use shared Zod schemas; operations use the same configured store; no application code reads `.env` directly  
**Scale/Scope**: One server process, three tools (`list_alerts`, `open_incident`, `resolve_incident`), and process-level tests covering discovery and calls

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / constraint | Gate | Design response |
|---|---|---|
| Boundaries validated by schemas | PASS | Reuse named Zod schemas for the existing tool inputs in both LangChain and MCP registration; let the SDK validate MCP inputs against those schemas. |
| Layered MVC responsibilities | PASS | Treat the MCP server as a transport adapter; retain persistence in `OpsStore` and domain rules in its existing operations. |
| Test-first changes | PASS | Add Node test-runner coverage that starts the server as a child process, lists tools, invokes operations, and checks stdout/stderr separation. |
| Explicit domain errors | PASS | Translate expected domain failures to explicit MCP tool errors; do not return success-shaped results on failure. |
| Secure and responsible operations | PASS | Use the existing configured store, do not introduce secrets, and keep `.env` loading in the Node launch command rather than reading it in application code. |
| Runtime and persistence constraints | PASS | Use Node 22 ESM and the existing built-in SQLite store; add no database server. |

No constitution violations or exceptions are required.

## Project Structure

### Documentation (this feature)

```text
specs/005-mcp-server-tools/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── mcp-tools.md
└── tasks.md                  # Created by /speckit-tasks
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── tools.ts              # Existing operations and shared Zod input schemas
│   └── tools.test.ts         # Existing operation/schema tests
├── mcp/
│   ├── server.ts             # MCP stdio transport adapter
│   └── server.test.ts        # MCP subprocess integration tests
└── store/
    ├── ops-store.ts          # Existing store interface
    └── sqlite-ops-store.ts   # Existing configured SQLite implementation
```

**Structure Decision**: Add the MCP transport adapter and its integration test under `src/mcp/`. Keep shared input schemas and existing operation definitions in `src/agents/tools.ts`; keep all authoritative state and domain decisions in the existing `OpsStore` implementation. No new service or persistence layer is needed.

## Complexity Tracking

No constitution violations; no additional complexity justification is required.
