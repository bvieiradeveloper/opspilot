# Implementation Plan: Persisted Request Tracing

**Branch**: `014-persisted-request-tracing` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/014-persisted-request-tracing/spec.md`

## Summary

Add request correlation to chat responses, durable request and trace-event storage, request lookup, and metadata-only JSON Lines event logging. Use the existing Express, Zod, MVC, and built-in SQLite conventions. A request record is created once a chat request is accepted, then finalized with its outcome and metrics; trace events are persisted in their original order. Logs are emitted through a metadata allowlist, not by serializing request or trace objects.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode; Node.js 22 LTS

**Primary Dependencies**: Express 5, Zod 4, Node.js built-in `node:sqlite` (`DatabaseSync`)

**Storage**: SQLite at the configured `OPSPILOT_DB` path (default `./data/opspilot.db`); isolated in-memory database for tests

**Testing**: `node:test` through `tsx`; `npm run test` and `npm run typecheck`

**Target Platform**: Node.js API service

**Project Type**: Express web service organized in MVC-style source layers

**Performance Goals**: No new throughput target is specified; request lookup and logging must not change the existing chat timeout contract.

**Constraints**: Validate HTTP inputs and outputs with Zod; use prepared statements; keep database access in the model/store layer; keep logs free of request and trace payloads; do not require external model or network access in tests.

**Scale/Scope**: One request record per accepted chat request and zero or more ordered trace events per request; one lookup endpoint and a reusable structured logger.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / constraint | Plan alignment | Gate |
|---|---|---|
| Boundaries validated by schemas | Validate the request identifier, lookup response, and chat response at HTTP boundaries with Zod. | PASS |
| Layered MVC responsibilities | SQLite persistence stays in a request-trace store/model; request lifecycle and logging orchestration stay in services; Express handlers translate to HTTP. | PASS |
| Test-first changes | Add isolated SQLite store tests, HTTP contract/integration tests, and logger tests; run both required package checks. | PASS |
| Explicit domain errors | Use a dedicated not-found domain error for lookup and translate it in the HTTP boundary; unexpected persistence errors remain server errors. | PASS |
| Secure and responsible operations | Keep payloads out of logs, preserve payloads only in the explicitly requested trace store, and do not read `.env` in application code. | PASS |
| Technology constraints | Use the existing TypeScript/ESM/Express stack and built-in SQLite; do not add dependencies or a database server. | PASS |

No blocking gate violations or unresolved technical clarifications were found.

## Project Structure

### Documentation (this feature)

```text
specs/014-persisted-request-tracing/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── request-tracing-http-and-logs.md
```

### Source Code (repository root)

```text
src/
├── http/
│   ├── server.ts                     # Request-ID response and request lookup route
│   └── server.test.ts                # HTTP contract and end-to-end coverage
├── obs/
│   ├── logger.ts                     # Metadata-only JSON Lines logger
│   └── logger.test.ts
├── services/
│   └── request-tracing-service.ts    # Request lifecycle and trace persistence orchestration
└── store/
    ├── request-trace-store.ts        # Store interface and validated entities
    ├── sqlite-request-trace-store.ts # SQLite implementation
    └── sqlite-request-trace-store.test.ts
```

**Structure Decision**: Extend the existing single-project layout. Keep persistence implementation in `src/store/`, orchestration in `src/services/`, transport handling in `src/http/`, and the standalone observational logger in `src/obs/`. Keep tests co-located with the related source, consistent with the repository.

## Complexity Tracking

No constitution violations require justification.
