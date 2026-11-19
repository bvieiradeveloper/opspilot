# Tasks: Model Fallback Resilience

**Input**: Design documents from `specs/013-model-fallback-resilience/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/chat-api.md`

**Tests**: Included because FR-008 explicitly requires automated coverage and the project
constitution requires tests for every new behavior.

**Organization**: Tasks are grouped by user story so fallback success and terminal failure can be
implemented and validated as separate increments. User Story 2 depends on the resilient model
composition completed for User Story 1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with another task in the same phase because it edits a different
  file and has no dependency on unfinished work.
- **[Story]**: Maps a task to the user story in `spec.md`.
- Every task names the exact project file or files to change.

## Path Conventions

- Single TypeScript project: application code and tests are under `src/`.
- Feature documentation is under `specs/013-model-fallback-resilience/`.

## Phase 1: Setup

**Purpose**: No project initialization is needed. The existing TypeScript, LangChain, Express,
Zod, and `node:test` dependencies and package scripts already satisfy the plan.

No tasks.

---

## Phase 2: Foundational

**Purpose**: No separate cross-story implementation is required. User Story 1 builds the shared
resilient model composition; User Story 2 depends on that completed composition.

No tasks.

---

## Phase 3: User Story 1 - Manter o atendimento com um modelo reserva (Priority: P1) 🎯 MVP

**Goal**: Retry the primary model, use the optional fallback on primary exhaustion, and report
which configured model produced a usable response.

**Independent Test**: With fake model candidates and no network access, verify that primary
success avoids fallback, primary failure retries before fallback, and fallback success produces
`metrics.modelUsed` and a `fallback` trace event.

### Tests for User Story 1

- [X] T001 [P] [US1] Add offline tests for primary success, two total attempts for each configured model, optional `OPENROUTER_MODEL_FALLBACK`, and successful fallback composition in `src/agents/model.test.ts`
- [X] T002 [P] [US1] Add tests for successful candidate tracking and fallback event formatting in `src/agents/metrics.test.ts` and `src/agents/trace.test.ts`
- [X] T003 [P] [US1] Add a `POST /chat` success contract test for optional `metrics.modelUsed` and a `fallback` trace event in `src/http/server.test.ts`

### Implementation for User Story 1

- [X] T004 [P] [US1] Validate optional trimmed `OPENROUTER_MODEL_FALLBACK` and compose the primary and fallback with `withRetry({ stopAfterAttempt: 2 })`, placing the primary before `withFallbacks([fallback])`; expose an injectable candidate-construction seam in `src/agents/model.ts`
- [X] T005 [P] [US1] Extend `Metrics` with optional `modelUsed` and add a `fallback` trace variant with `node`, `from`, and `to` fields in `src/agents/reasoning.ts`
- [X] T006 [US1] Extend the per-run callback to count each model attempt, capture the configured candidate that completed successfully, and report successful fallback transitions in `src/agents/metrics.ts`
- [X] T007 [US1] Format the `fallback` trace event with its source and destination model IDs in `src/agents/trace.ts`
- [X] T008 [US1] Pass the resilient model runnable through the ReAct agent and merge its model-use and fallback observations into the returned result in `src/agents/react.ts`
- [X] T009 [US1] Compose primary and fallback structured-output runnables for planner and replanner calls, and propagate their model-use and fallback observations in `src/agents/plan-and-execute.ts`
- [X] T010 [US1] Capture routing-model candidate usage and fallback trace in the production graph without discarding existing strategy metrics in `src/graph/production-graph.ts`
- [X] T011 [US1] Preserve model-use metrics and append fallback trace events when reflection and regenerated answers are merged in `src/agents/reflection.ts`
- [X] T012 [US1] Use the resilient candidate composition for summarization and learning-reflection model calls in `src/services/conversation-summarizer.ts` and `src/services/learning-reflector.ts`
- [X] T013 [US1] Extend the Zod chat response schema to accept optional `metrics.modelUsed` and the `fallback` event shape `{ type, node, from, to }` in `src/http/server.ts`

**Checkpoint**: A successful primary or fallback response is independently verifiable through
offline model tests and the `POST /chat` response.

---

## Phase 4: User Story 2 - Receber uma falha explícita quando todos os modelos falham (Priority: P2)

**Goal**: Return a safe HTTP 503 when all configured model candidates fail, with no successful
assistant response persisted or returned.

**Independent Test**: Simulate primary retry exhaustion with and without a configured fallback,
force every candidate to fail, and verify `503 MODEL_UNAVAILABLE`, a safe message, and no
assistant success response.

### Tests for User Story 2

- [X] T014 [P] [US2] Add offline model-factory tests that exhaust both attempts of primary and fallback, and exhaust the primary when no fallback is configured, in `src/agents/model.test.ts`
- [X] T015 [P] [US2] Add HTTP tests asserting exhausted model execution returns status 503 with `MODEL_UNAVAILABLE` and a provider-detail-free message in `src/http/server.test.ts`
- [X] T016 [P] [US2] Add service tests proving a typed model-unavailable failure does not append an assistant success message in `src/services/chat-service.test.ts`

### Implementation for User Story 2

- [X] T017 [US2] Add `ModelUnavailableError` as a dedicated domain error with a safe internal message in `src/agents/errors.ts`
- [X] T018 [US2] Convert exhausted configured model attempts to `ModelUnavailableError` while allowing configuration errors and request cancellation to retain their existing meanings in `src/agents/model.ts`
- [X] T019 [US2] Preserve `ModelUnavailableError` through the automatic-router fallback catch and summarization error translation in `src/graph/production-graph.ts` and `src/services/chat-service.ts`
- [X] T020 [US2] Map `ModelUnavailableError` to the validated HTTP 503 response `{ error: { code: "MODEL_UNAVAILABLE", message: "All configured models are unavailable. Try again later." } }` in `src/http/server.ts`

**Checkpoint**: Both configured-fallback exhaustion and primary-only exhaustion return 503
without exposing raw provider errors or a partial assistant response.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Run repository quality gates and ensure validation instructions match the delivered
behavior.

- [X] T021 [P] Run focused model, metrics, trace, and HTTP tests from `specs/013-model-fallback-resilience/quickstart.md`
- [X] T022 [P] Run `npm run test` and `npm run typecheck` from `package.json` and resolve any regressions introduced by this feature

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No work required; dependencies and scripts already exist.
- **Foundational (Phase 2)**: No separate work required.
- **User Story 1 (Phase 3)**: Can start immediately. Its tests precede implementation; `T004` and
  `T005` can run in parallel, and the model/trace integrations follow their shared contracts.
- **User Story 2 (Phase 4)**: Depends on the resilient model composition from User Story 1,
  especially `T004` and successful completion of the model-invocation integrations. Its tests must
  be written before the corresponding error-path changes.
- **Polish (Phase 5)**: Depends on both stories being implemented.

### User Story Dependencies

- **User Story 1 (P1)**: No user-story dependencies; it is the MVP.
- **User Story 2 (P2)**: Depends on User Story 1's model candidate composition so complete
  exhaustion can be translated consistently at the HTTP boundary.

### Within Each User Story

- Write deterministic offline tests first; no test may call OpenRouter.
- Keep each runnable's fallback composition adjacent to its existing model call site.
- Preserve `ModelUnavailableError` through catches and wrappers until the HTTP boundary.
- Validate the final HTTP response with the existing Zod boundary schema.

### Parallel Opportunities

- **US1 tests**: `T001`, `T002`, and `T003` use different test files and can be authored in
  parallel.
- **US1 foundations**: `T004` and `T005` edit different files and can run in parallel after the
  tests are established.
- **US1 integrations**: `T008`, `T009`, `T010`, `T011`, and `T012` target separate call-site
  files; after `T004`-`T007` are complete, they can be implemented in parallel.
- **US2 tests**: `T014`, `T015`, and `T016` target different files and can be authored in parallel
  after US1 is complete.
- **US2 error handling**: `T017` must precede `T018` and `T019`; `T020` depends on the error type
  and propagation tasks.
- **Polish**: `T021` and `T022` can run in parallel after both user stories are complete.

## Parallel Example: User Story 1

```text
Task: "T001 Add offline model factory tests in src/agents/model.test.ts"
Task: "T002 Add metrics and trace tests in src/agents/metrics.test.ts and src/agents/trace.test.ts"
Task: "T003 Add the /chat success contract test in src/http/server.test.ts"

After tests are established and shared contracts are ready:
Task: "T008 Integrate fallback metrics in src/agents/react.ts"
Task: "T009 Integrate structured-output fallback in src/agents/plan-and-execute.ts"
Task: "T010 Integrate router fallback in src/graph/production-graph.ts"
Task: "T011 Integrate reflection result aggregation in src/agents/reflection.ts"
Task: "T012 Integrate fallback in src/services/conversation-summarizer.ts and src/services/learning-reflector.ts"
```

## Parallel Example: User Story 2

```text
Task: "T014 Test complete model exhaustion in src/agents/model.test.ts"
Task: "T015 Test HTTP 503 mapping in src/http/server.test.ts"
Task: "T016 Test no assistant success persistence in src/services/chat-service.test.ts"
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete `T001`-`T013`, following the dependencies above.
2. Stop and validate that primary success and fallback success are observable without a live
   provider.
3. This MVP can demonstrate resilience when the reserve model succeeds; it does not yet deliver
   the final 503 behavior.

### Incremental Delivery

1. Deliver User Story 1 with fallback selection, `metrics.modelUsed`, and the `fallback` trace.
2. Add User Story 2 to classify exhausted models and return HTTP 503.
3. Run focused checks and then the full test and typecheck scripts.

## Notes

- `[P]` tasks edit different files and have no dependency on unfinished work.
- `[US1]` and `[US2]` map directly to the prioritized stories in `spec.md`.
- The selected factory example uses two total attempts for both primary and fallback; the installed
  default is three, so the task sets `stopAfterAttempt: 2` explicitly on both.
- Model IDs may appear in metrics and fallback trace; API keys and raw provider details may not.
