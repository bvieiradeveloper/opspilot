# Tasks: Request Analytics

**Input**: Design documents from `specs/015-request-analytics/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/request-analytics-http.md`

**Organization**: Tasks are grouped by user story. Shared cost capture and persistence are foundational because both stories depend on accurate request metrics.

## Phase 1: Setup

**Purpose**: The existing TypeScript/Express project, SQLite store, and package scripts already provide the required setup; no project initialization changes are needed.

## Phase 2: Foundational - Provider Cost Persistence

**Purpose**: Persist validated provider-reported cost without breaking existing SQLite databases or request records.

- [X] T001 [P] Add failing tests for provider usage cost extraction (finite, non-negative values and missing/invalid values) in `src/agents/metrics.test.ts`
- [X] T002 [P] Add failing SQLite tests for persisted cost values and existing database compatibility (`providerCost` nullable; finite, non-negative when present) in `src/store/sqlite-request-trace-store.test.ts`
- [X] T003 Extend model metrics and callback extraction to expose optional `providerCost` only when provider usage supplies a finite, non-negative value in `src/agents/reasoning.ts` and `src/agents/metrics.ts`
- [X] T004 Persist `providerCost` as a nullable request field and add a safe upgrade path for existing `requests` tables in `src/store/request-trace-store.ts` and `src/store/sqlite-request-trace-store.ts`

**Checkpoint**: Existing requests remain readable with a null cost; newly completed requests preserve valid provider-reported cost.

## Phase 3: User Story 1 - Review Request Health and Usage (Priority: P1) 🎯 MVP

**Goal**: Return an overall request summary for a validated recent time window, including counts, available tokens and cost, and latency percentiles.

**Independent Test**: Insert known requests with timestamps, outcomes, usage, costs, and latency; call `GET /states?since=24h` and verify the overall summary and empty-window behavior.

### Tests for User Story 1

- [X] T005 [P] [US1] Add SQLite tests for analytics-window reads, including inclusive start and exclusive end, in-progress rows, and metric-only results without trace payloads in `src/store/sqlite-request-trace-store.test.ts`
- [X] T006 [P] [US1] Add service tests for duration validation, default 24h, 30d maximum, overall totals, missing measurements, free-model zero cost, empty windows, and nearest-rank p50/p95 in `src/services/request-analytics-service.test.ts`
- [X] T007 [P] [US1] Add HTTP contract tests for `GET /states`, omitted/valid/invalid/repeated `since`, response schema validation, and error propagation in `src/http/request-analytics.test.ts`

### Implementation for User Story 1

- [X] T008 [US1] Add a prepared, parameterized request-metrics window query with `started_at >= startsAt` and `started_at < evaluatedAt` in `src/store/request-trace-store.ts` and `src/store/sqlite-request-trace-store.ts`
- [X] T009 [US1] Implement the analytics service with positive integer `m`/`h`/`d` durations capped at `30d`, default `24h`, recorded input-token totals, known USD cost and unavailable counts, failed/timed-out counts, and nearest-rank latency percentiles in `src/services/request-analytics-service.ts`
- [X] T010 [US1] Add the Zod-validated `GET /states` controller, capture one evaluation timestamp, and validate the overall response in `src/http/server.ts`

**Checkpoint**: `GET /states` returns a correct overall summary with tested time-window validation and empty-window behavior.

## Phase 4: User Story 2 - Compare Routes and Models (Priority: P2)

**Goal**: Include independently aggregated route and model groups, including explicit null-key groups for unknown values.

**Independent Test**: Insert requests across multiple routes and models, including missing values, then verify every group and its reconciliation with the overall totals.

### Tests for User Story 2

- [X] T011 [P] [US2] Add service tests for route/model grouping, unknown null-key groups, measurement availability, and reconciliation with overall aggregates in `src/services/request-analytics-service.test.ts`
- [X] T012 [P] [US2] Add HTTP tests verifying `byRoute` and `byModel` response arrays and unknown groups in `src/http/request-analytics.test.ts`

### Implementation for User Story 2

- [X] T013 [US2] Extend the analytics service to aggregate the same request set by route and selected model, retaining null as the unknown group key in `src/services/request-analytics-service.ts`
- [X] T014 [US2] Extend the response Zod schema and `GET /states` JSON response with `byRoute` and `byModel` summaries in `src/http/server.ts`

**Checkpoint**: Every selected request contributes to exactly one route and one model group, and grouped totals reconcile with the overall summary.

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verify implementation against the feature contract and project quality gates.

- [X] T015 Run the complete test suite and typecheck using the scripts in `package.json`; resolve any regressions affecting the analytics feature
- [X] T016 Validate the documented request/response and edge-case scenarios in `specs/015-request-analytics/quickstart.md`

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No changes required; project structure and scripts already exist.
- **Foundational (Phase 2)**: Required before either story because provider cost must be persisted for the requested totals.
- **User Story 1 (Phase 3)**: Depends on the foundational cost persistence and provides the MVP overall summary.
- **User Story 2 (Phase 4)**: Depends on User Story 1's analytics service and response contract; adds breakdowns without changing overall metric semantics.
- **Polish (Phase 5)**: Depends on both stories.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after Phase 2; no dependency on another user story.
- **User Story 2 (P2)**: Extends the aggregation and endpoint delivered by User Story 1.

### Parallel Opportunities

- T001 and T002 can run in parallel because they add tests in separate files.
- Within User Story 1, T005, T006, and T007 can run in parallel because they target separate store, service, and HTTP test files.
- Within User Story 2, T011 and T012 can run in parallel because they target separate service and HTTP test files.
- User stories are sequential because the grouped output extends the P1 endpoint.

## Parallel Example: User Story 1

```text
Task: T005 SQLite window-read tests in src/store/sqlite-request-trace-store.test.ts
Task: T006 overall aggregation tests in src/services/request-analytics-service.test.ts
Task: T007 GET /states contract tests in src/http/request-analytics.test.ts
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete provider-cost persistence foundation.
2. Implement and independently test the overall analytics summary (User Story 1).
3. Validate `GET /states` for default, valid, invalid, and empty-window cases.
4. Add route/model groupings (User Story 2) and verify reconciliation.
5. Run the full test suite and typecheck.
