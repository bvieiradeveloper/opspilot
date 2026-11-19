# Tasks: Persisted Request Tracing

**Input**: Design documents from `specs/014-persisted-request-tracing/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`

**Tests**: Included because the project constitution requires tests for every new behavior.

**Organization**: Tasks are grouped by user story so each increment can be implemented and verified independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with another task in this phase because it edits separate files and has no incomplete prerequisite.
- **[Story]**: Maps a task to the corresponding user story in `spec.md`.
- Every task names the source or test file it creates or changes.

## Phase 1: Setup

**Purpose**: Prepare reusable deterministic test infrastructure without adding dependencies or changing project configuration.

- [X] T001 Create a deterministic chat-server test fixture with in-memory stores and cleanup in `src/http/request-tracing-test-utils.ts`

## Phase 2: Foundational

**Purpose**: Establish the validated store contract and SQLite persistence primitives required by all user stories.

- [X] T002 [P] Define Zod schemas and `RequestTraceStore` types in `src/store/request-trace-store.ts`; require `requestId` and `userId` to be non-empty strings, route to be a supported route or null, status to be exactly `in_progress`, `succeeded`, `failed`, or `timed_out`, `startedAt` to be an ISO 8601 timestamp, `completedAt`, `statusCode`, metrics, model, prompt-token count, and latency to be nullable where specified in `data-model.md`, `errorCode` to match `^[A-Z][A-Z0-9_]{0,63}$` or null, and trace `sequence` to be a positive integer unique within its request
- [X] T003 [P] Add isolated SQLite store tests for idempotent schema creation, request lifecycle writes, JSON payload round-tripping, and per-request event sequence constraints in `src/store/sqlite-request-trace-store.test.ts`
- [X] T004 Implement the `requests` and `trace_events` tables, including user, selected route, model, token, latency, foreign key and sequence fields/constraints; use prepared statements, JSON persistence, and short transactional request/event writes in `src/store/sqlite-request-trace-store.ts`; use `OPSPILOT_DB` with default `./data/opspilot.db` and support `:memory:` for tests

**Checkpoint**: Store types and SQLite lifecycle writes are ready; user-story work can proceed.

## Phase 3: User Story 1 - Correlate a chat request (Priority: P1)

**Goal**: Give every accepted chat request a consistent generated identifier and persist its outcome, available metrics, and execution trace.

**Independent Test**: Submit deterministic accepted chat requests and confirm each response body `requestId` equals its `X-Request-id` header, IDs differ between requests, and their records retain the corresponding outcome, metrics, and trace.

### Tests for User Story 1

- [X] T005 [P] [US1] Add service tests for initial `in_progress` persistence, terminal success/failure/timeout states, available metrics, and trace capture in `src/services/request-tracing-service.test.ts`
- [X] T006 [P] [US1] Add HTTP tests proving the `requestId` body field matches `X-Request-id` on success and accepted processing errors, and separate requests receive distinct IDs in `src/http/server.test.ts`

### Implementation for User Story 1

- [X] T007 [US1] Implement request-ID generation and request lifecycle orchestration in `src/services/request-tracing-service.ts`; persist `in_progress` before chat execution, persist the terminal status and available metrics when processing ends, and preserve the generated ID for failures and timeouts
- [X] T008 [US1] Integrate the request lifecycle into `POST /chat` in `src/http/server.ts`; validate the response `requestId` with Zod, return it in the body and `X-Request-id` header, persist user ID, selected route, available model/token/latency metrics, preserve existing response/error behavior, and persist the produced trace events in occurrence order

**Checkpoint**: Accepted chat requests carry a correlatable identifier and a persistent outcome/trace.

## Phase 4: User Story 2 - Inspect a request and its trace (Priority: P1)

**Goal**: Retrieve a persisted request record with its metrics and ordered trace, or an explicit not-found response.

**Independent Test**: Persist a known request, reopen its file-backed SQLite store, and retrieve the record with matching metrics and trace events ordered by ascending sequence; verify empty and unknown-ID outcomes.

### Tests for User Story 2

- [X] T009 [P] [US2] Add store tests for file-backed restart durability, `getRequestWithTrace` ordering, empty traces, and unknown identifiers in `src/store/sqlite-request-trace-store.test.ts`
- [X] T010 [P] [US2] Add HTTP contract tests for `GET /request/:id` success, ordered and empty traces, invalid identifiers, and unknown-ID `404` in `src/http/server.test.ts`

### Implementation for User Story 2

- [X] T011 [US2] Implement `getRequestWithTrace` in `src/store/sqlite-request-trace-store.ts`; validate decoded request/metrics/event data and use explicit ascending sequence ordering
- [X] T012 [US2] Add a dedicated request-not-found error in `src/agents/errors.ts` and implement the Zod-validated `GET /request/:id` route and stable `REQUEST_NOT_FOUND` response in `src/http/server.ts`

**Checkpoint**: Operators can look up a request after completion or service restart and receive only that request's ordered trace.

## Phase 5: User Story 3 - Review operational logs without exposing event content (Priority: P2)

**Goal**: Emit one machine-readable metadata-only JSON line per operational event, correlated to the request ID where available.

**Independent Test**: Emit an event containing request and trace payload values, parse the single emitted JSON line, and confirm metadata remains while all payload content is absent.

### Tests for User Story 3

- [X] T013 [P] [US3] Add logger tests for one valid JSON line per event, metadata allowlisting, request-ID correlation, and payload/exception-content exclusion in `src/obs/logger.test.ts`

### Implementation for User Story 3

- [X] T014 [US3] Implement the JSON Lines logger in `src/obs/logger.ts`; serialize one record plus newline per event and emit only explicitly allowlisted timestamp, level, event name, request ID, node, route, outcome, status code, duration, and prompt-token metadata, never user IDs or payload content
- [X] T015 [US3] Wire start, completion, failure, and timeout metadata events to the logger in `src/services/request-tracing-service.ts`; do not log chat bodies, answers, trace payloads, tool inputs/results, or raw exception messages

**Checkpoint**: Request lifecycle events are logged as safe, correlatable JSON Lines without payload contents.

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the full feature against the documented scenarios and project quality gates.

- [X] T016 Run the persistence and restart scenarios documented in `specs/014-persisted-request-tracing/quickstart.md`; fix failures in `src/store/sqlite-request-trace-store.test.ts` and `src/http/server.test.ts`
- [X] T017 Run `npm run test` and `npm run typecheck`; resolve feature-related failures in `src/store/sqlite-request-trace-store.ts`, `src/services/request-tracing-service.ts`, `src/http/server.ts`, and `src/obs/logger.ts`

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependency; prepares a deterministic fixture used by later tests.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories because they share the store contract and SQLite lifecycle persistence.
- **User Stories (Phases 3-5)**: Depend on the foundational phase. US2 depends on US1's persisted request lifecycle for its end-to-end lookup scenario. US3 depends on US1 to receive request IDs for lifecycle log correlation; the logger itself is directly testable.
- **Polish (Phase 6)**: Depends on all intended user stories.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; no dependency on another user story.
- **US2 (P1)**: Starts after Phase 2; its standalone store/route behavior is testable with seeded request records, and full chat-to-lookup verification follows US1.
- **US3 (P2)**: Logger unit behavior is independently testable after Phase 2; request-lifecycle logging integration follows US1.

### Within Each User Story

- Write tests before implementing the behavior they cover.
- Define store types before the SQLite implementation; persistence is complete before request orchestration uses it.
- Implement request lifecycle orchestration before integrating it into the HTTP handler.
- Implement and validate request lookup before exposing its route.
- Implement the logger before wiring lifecycle events to it.

### Parallel Opportunities

- T002 and T003 can proceed in parallel because they touch separate files.
- T005 and T006 can proceed in parallel because service and HTTP tests are separate files.
- T009 and T010 can proceed in parallel because store and HTTP tests are separate files.
- T013 is independent of the US1 and US2 lookup implementation after the foundational phase.
- After Phase 2, US1 and the logger-only portion of US3 can be developed concurrently; US2 can develop against seeded records, while its end-to-end test waits for US1.

## Parallel Examples

### Foundation

```text
Task: T002 Define store schemas and interface in src/store/request-trace-store.ts
Task: T003 Add foundational SQLite tests in src/store/sqlite-request-trace-store.test.ts
```

### User Story 1

```text
Task: T005 Add lifecycle service tests in src/services/request-tracing-service.test.ts
Task: T006 Add chat response/header tests in src/http/server.test.ts
```

### User Story 2

```text
Task: T009 Add persistence and ordered-lookup tests in src/store/sqlite-request-trace-store.test.ts
Task: T010 Add GET /request contract tests in src/http/server.test.ts
```

### User Story 3

```text
Task: T013 Add JSON Lines safety tests in src/obs/logger.test.ts
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup and Foundational phases.
2. Complete US1 tests and implementation.
3. Validate request ID consistency, persisted outcomes, and trace capture with deterministic strategies.
4. Stop for review; the request is correlatable and recorded before adding lookup/log review features.

### Incremental Delivery

1. Add US1 to create correlatable persisted request records.
2. Add US2 to retrieve records and ordered traces, including after restart.
3. Add US3 to emit metadata-only logs correlated by request ID.
4. Run quickstart scenarios, the full test suite, and typecheck.
