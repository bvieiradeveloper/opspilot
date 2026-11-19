# Implementation Plan: Request Analytics

**Branch**: `015-request-analytics` | **Date**: 2026-11-11 | **Spec**: [`spec.md`](./spec.md)

**Input**: Feature specification from [`spec.md`](./spec.md)

## Summary

Add a validated `GET /states?since=24h` analytics endpoint over persisted request records. Extend request metrics and SQLite persistence to retain provider-reported cost, add an aggregate query to the request store, and calculate overall and route/model summaries in a service. Missing paid-model cost remains explicitly unavailable; models ending in `:free` contribute zero.

## Technical Context

**Language/Version**: TypeScript ESM with strict mode; Node.js 22 LTS baseline.

**Primary Dependencies**: Existing Express, Zod, LangChain/OpenRouter client, Node built-ins; no new dependencies.

**Storage**: Existing SQLite request records via built-in `node:sqlite` `DatabaseSync`; persist the provider-reported request cost in the existing `requests` record.

**Testing**: `node:test` through `tsx`; `npm run test` and `npm run typecheck`.

**Target Platform**: Node.js API service.

**Project Type**: Single TypeScript/Express web service.

**Performance Goals**: Aggregate the selected request window with one bounded SQLite read and respond without loading trace payloads. No explicit response-time SLO was supplied.

**Constraints**: Validate query and response with Zod; keep database access in the request store and aggregation rules in a service; use bound SQL parameters; preserve compatibility with existing request records; never estimate non-free model prices.

**Scale/Scope**: One new read-only endpoint and an overall, route, and model breakdown over records retained in the existing SQLite database. `since` accepts positive integer minute/hour/day durations and is capped at 30 days; omitted `since` means 24 hours.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Boundaries validated by schemas**: Pass. Validate query input, persisted cost values, and the response at the HTTP/service boundary with Zod.
- **Layered MVC responsibilities**: Pass. Keep prepared reads in the existing request store, aggregation in a service, and HTTP parsing/response in the controller.
- **Test-first changes**: Pass. Add store, service, and HTTP tests, including isolated SQLite tests; run the project test and typecheck scripts.
- **Explicit domain errors**: Pass. Invalid query values map to the existing client validation pattern; unexpected storage failures continue through the existing error middleware.
- **Secure and responsible operations**: Pass. No secrets or raw prompts/traces are added to analytics; SQL uses bound parameters and only aggregate/request metric columns are read.
- **Technology constraints**: Pass. Use existing TypeScript, Express, Zod, Node built-ins, and SQLite; add no database or package dependency.
- **Workflow and quality gates**: Pass. Versioned artifacts are under `specs/015-request-analytics/`; planned completion requires passing `npm run test` and `npm run typecheck`.

**Pre-research gate**: PASS.  
**Post-design gate**: PASS. The design extends the existing request record and store boundary and uses one focused aggregation service; no new architectural layer or external dependency is introduced.

## Phase 0: Research

See [`research.md`](./research.md). Repository inspection resolved the storage, metric extraction, time-window, and error-handling decisions; no unresolved technical clarifications remain.

## Phase 1: Design & Contracts

- [`data-model.md`](./data-model.md) defines the stored request cost, analytics window, and aggregate value objects.
- [`contracts/request-analytics-http.md`](./contracts/request-analytics-http.md) defines `GET /states`, query validation, response metrics, grouping, and error behavior.
- [`quickstart.md`](./quickstart.md) defines runnable endpoint and test validation scenarios.

## Project Structure

### Documentation (this feature)

```text
specs/015-request-analytics/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── request-analytics-http.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── metrics.ts                         # Extract input tokens and provider cost from model usage
│   └── reasoning.ts                       # Extend request metrics with optional provider cost
├── http/
│   ├── server.ts                          # Validate and expose GET /states
│   └── request-analytics.test.ts          # Endpoint contract and aggregation integration tests
├── services/
│   ├── request-analytics-service.ts       # Window filtering and aggregate/group calculations
│   └── request-analytics-service.test.ts  # Deterministic aggregation tests
└── store/
    ├── request-trace-store.ts             # Extend request/store contract for analytics
    ├── sqlite-request-trace-store.ts      # Persist costs and query bounded request metrics
    └── sqlite-request-trace-store.test.ts # SQLite persistence and filtering tests
```

**Structure Decision**: Use the existing single-project MVC structure. The HTTP handler validates the external query and serializes the result; a request analytics service owns time and aggregation rules; the existing SQLite request store reads request metric rows and persists provider-reported costs. Tests remain alongside the relevant source files, following repository conventions.

## Complexity Tracking

No constitution violations or additional architectural projects are introduced.
