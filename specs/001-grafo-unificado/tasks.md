# Tasks: Grafo Unificado

**Input**: Design documents from `/specs/001-grafo-unificado/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/chat-route-contract.md, quickstart.md

**Tests**: The constitution requires test-first changes. Tasks therefore include graph, trace, service, and HTTP tests for each story.

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Phase 1: Setup

- [X] T001 Verify the implementation baseline with `npm run typecheck` and `npm run test` in the repository root.
- [X] T002 Review existing strategy registration and graph conventions in src/agents/index.ts and src/agents/plan-and-execute.ts.
- [X] T003 [P] Review trace payload construction in src/agents/react.ts, src/agents/reflection.ts, and src/agents/reasoning.ts.
- [X] T004 Review the `/chat` validation and response contract in src/http/server.ts and src/services/chat-service.ts.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared types and contracts required before any user story can be implemented.

- [X] T005 Extend the shared trace model with required `node`, a supported `route` event, and route/reason fields in src/agents/reasoning.ts.
- [X] T006 Extend all strategy trace constructors so emitted events receive their strategy node name in src/agents/react.ts, src/agents/plan-and-execute.ts, and src/agents/reflection.ts.
- [X] T007 Add structured routing schema and routing route table types in src/agents/production-graph.ts.
- [X] T008 Add graph state fields for prepared context, routing decision, selected strategy, answer, trace, and metrics in src/agents/production-graph.ts.
- [X] T009 Re-export the production graph from src/agents/index.ts while preserving the existing strategy registry compatibility API.

**Checkpoint**: Foundational trace and graph contracts exist; user story implementation can proceed independently.

---

## Phase 3: User Story 1 - Automatic Strategy Selection (Priority: P1) MVP

**Goal**: Route valid chat requests automatically through context, router, one supported strategy node, and response.

**Independent Test**: Send representative requests without `strategy` and verify one route event plus execution through the expected strategy.

### Tests for User Story 1

- [X] T010 [P] [US1] Add structured-router unit tests for each supported route using a deterministic model response in src/agents/production-graph.test.ts.
- [X] T011 [P] [US1] Add graph integration tests proving context, route, strategy, and response node ordering in src/agents/production-graph.test.ts.
- [X] T012 [P] [US1] Add HTTP test coverage for automatic routing without a strategy override in src/http/server.test.ts.

### Implementation for User Story 1

- [X] T013 [US1] Implement the context graph node by reusing bounded context preparation from src/context-builder.ts in src/agents/production-graph.ts.
- [X] T014 [US1] Implement the router node with `withStructuredOutput`, `route`, `reason`, and the complete strategy routing table in src/agents/production-graph.ts.
- [X] T015 [US1] Implement separate `react`, `plan-and-execute`, and reflection strategy graph nodes using the existing registry implementations in src/agents/production-graph.ts.
- [X] T016 [US1] Add conditional graph edges that route exactly one supported request to its selected strategy node in src/agents/production-graph.ts.
- [X] T017 [US1] Implement the response graph node that merges answer, trace, and existing metrics in src/agents/production-graph.ts.
- [X] T018 [US1] Change the service orchestration to invoke the production graph instead of selecting a strategy directly in src/services/chat-service.ts.

**Checkpoint**: User Story 1 works independently with automatic routing and a unified trace.

---

## Phase 4: User Story 2 - Explicit Strategy Override (Priority: P2)

**Goal**: Let `/chat` accept an optional supported strategy and bypass automatic routing when it is supplied.

**Independent Test**: Send one request with each supported override and one unsupported override; verify deterministic execution or rejection before strategy execution.

### Tests for User Story 2

- [X] T019 [P] [US2] Add graph tests proving valid overrides skip the structured automatic routing model call in src/agents/production-graph.test.ts.
- [X] T020 [P] [US2] Add HTTP tests for supported `react`, `plan-and-execute`, and reflection override values in src/http/server.test.ts.
- [X] T021 [P] [US2] Add HTTP tests proving unknown overrides return an actionable client error before strategy execution in src/http/server.test.ts.

### Implementation for User Story 2

- [X] T022 [US2] Extend the `/chat` request schema with optional `strategy` validation and `reflect` compatibility in src/http/server.ts.
- [X] T023 [US2] Add override state handling that records `route`, `reason`, and `node: "router"` without invoking automatic routing in src/agents/production-graph.ts.
- [X] T024 [US2] Update unknown-strategy handling at the HTTP boundary while preserving the existing domain error response in src/http/server.ts.
- [X] T025 [US2] Pass the optional override and reflect compatibility state into the production graph call in src/services/chat-service.ts.

**Checkpoint**: User Story 2 works independently and remains compatible with existing direct strategy selection behavior.

---

## Phase 5: User Story 3 - Unified Execution Trace (Priority: P3)

**Goal**: Ensure every context, routing, strategy, and response trace event carries a consistent node identifier.

**Independent Test**: Run successful and partially successful graph requests and assert every emitted event has a non-empty known node identifier.

### Tests for User Story 3

- [X] T026 [P] [US3] Add trace tests for route, answer, thought, plan, action, observation, critique, and summarize node attribution in src/agents/trace.test.ts.
- [X] T027 [P] [US3] Add HTTP response-schema tests for required `node` fields and the route event shape in src/http/server.test.ts.
- [X] T028 [P] [US3] Add service tests proving summary events and existing strategy events retain one unified node-aware trace in src/services/chat-service.test.ts.

### Implementation for User Story 3

- [X] T029 [US3] Update the HTTP trace response Zod schema for the route event and required `node` on every event in src/http/server.ts.
- [X] T030 [US3] Add node attribution for context and route events in src/agents/production-graph.ts.
- [X] T031 [US3] Normalize strategy traces by adding the selected strategy node without exposing private extra fields in src/agents/production-graph.ts.
- [X] T032 [US3] Add response-node trace attribution and merge it with summary and strategy traces in src/services/chat-service.ts.
- [X] T033 [US3] Update trace formatting to render node-aware events while preserving deterministic secret-safe serialization in src/agents/trace.ts.

**Checkpoint**: User Story 3 is complete; the response trace is consistent across all graph stages.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T034 [P] Update existing unit fixtures that construct trace events to include the required `node` field in src/agents/*.test.ts and src/services/*.test.ts.
- [X] T035 Update the HTTP contract documentation with final route, override, and node response examples in specs/001-grafo-unificado/contracts/chat-route-contract.md.
- [X] T036 Add quickstart validation commands for automatic routing, override, reflection, and invalid override cases in specs/001-grafo-unificado/quickstart.md.
- [X] T037 Run `npm run typecheck` and resolve all graph and trace type errors in the repository root.
- [X] T038 Run `npm run test` and resolve failing graph, HTTP, service, and existing compatibility tests in the repository root.
- [X] T039 Re-run validation against specs/001-grafo-unificado/spec.md and mark success criteria covered by executable tests.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational; is the MVP baseline.
- **User Story 2 (Phase 4)**: Depends on Foundational; may run after or in parallel with US1 only after route types and graph nodes exist.
- **User Story 3 (Phase 5)**: Depends on Foundational and benefits from the strategy events added by US1.
- **Polish (Phase 6)**: Depends on all user-story phases being implemented.

### User Story Dependencies

- **US1**: No dependency on US2 or US3; requires existing strategy registry implementations.
- **US2**: Requires US1 routing types and graph edges; can share HTTP contract work with US3.
- **US3**: Requires US1 trace events and US2 route event shape; no dependency on US2 override behavior beyond shared schema.

### Parallel Opportunities

- Phase 1 tasks T002-T004 can proceed independently after baseline validation.
- Foundational tasks T005-T006 and T007-T008 can proceed in parallel when assignments are isolated by file.
- Within US1, T010-T012 are parallel test tasks; implementation tasks T013-T017 share graph state and should be sequenced.
- Within US2, T019-T021 are parallel tests; HTTP and graph implementation tasks can proceed in parallel after route types exist.
- Within US3, T026-T028 are parallel tests; T029/T033 and graph/service tasks can proceed independently when interfaces are agreed.

---

## Parallel Example: User Story 1

```text
T010 Add graph router tests
T011 Add graph node-order integration tests
T012 Add HTTP automatic-routing tests
T013 Implement context node after T010 defines state expectations
T014 Implement structured router node
```

## Parallel Example: User Story 2

```text
T019 Add override graph tests
T020 Add supported override HTTP tests
T021 Add unknown override HTTP tests
T022 Update request schema
T023 Implement override routing state
```

## Parallel Example: User Story 3

```text
T026 Add trace attribution tests
T027 Add HTTP trace schema tests
T028 Add service unified-trace tests
T029 Update HTTP response schema
T033 Update trace formatter
```

---

## Implementation Strategy

### MVP First: User Story 1 Only

1. Complete Phase 1 setup.
2. Complete Phase 2 foundational types and graph state.
3. Complete US1 tests and implementation.
4. Stop and validate automatic routing and unified route/strategy execution.

### Incremental Delivery

1. Add automatic routing as the MVP after the foundational checkpoint.
2. Add supported strategy overrides as an independently testable second increment.
3. Add trace node normalization and HTTP trace guarantees as the final behavior increment.
4. Finish with compatibility fixture updates and full validation.

### Suggested MVP Scope

The recommended MVP is **Phase 3 / User Story 1**: automatic routing through the context, router, strategy, and response graph nodes.
