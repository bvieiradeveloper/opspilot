# Tasks: Context Token Metrics

**Input**: Design documents from `/specs/010-context-token-metrics/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are explicitly requested by the feature specification and should be implemented as part of the story work.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the token-measurement module and the deterministic test entry points needed for the feature.

- [X] T001 Create the context measurement skeleton in `src/context/tokens.ts` and the matching test harness in `src/context/tokens.test.ts`
- [X] T002 [P] Add a dedicated test fixture for deterministic model usage and source breakdowns in `src/agents/metrics.test.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the request-scoped usage collector and the response contract before any story-specific implementation.

- [X] T003 Implement the request-scoped prompt usage collector and validation helpers in `src/agents/metrics.ts`
- [X] T004 [P] Extend the `/chat` response schema and validation in `src/http/server.ts` to accept `promptTokens` as nullable integer and `contextBreakdown` as non-negative estimates
- [X] T005 [P] Update the chat service result shape in `src/services/chat-service.ts` so actual usage and breakdown are preserved alongside `IICalls`, `latencyMs`, and `historyMessages`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - Inspect actual prompt usage (Priority: P1) ðŸŽ¯ MVP

**Goal**: Report real prompt-input totals from LangChain usage metadata and keep missing usage explicit as `null`.

**Independent Test**: Run a deterministic chat request whose model adapter returns known usage and assert that `metrics.promptTokens` matches the aggregate of actual input counts and remains `null` when usage is unavailable.

### Tests for User Story 1

- [X] T006 [P] [US1] Add failing unit tests for `estimateTokens` boundaries and zero-value handling in `src/context/tokens.test.ts`
- [X] T007 [P] [US1] Add failing strategy tests for complete and incomplete actual usage aggregation in `src/agents/metrics.test.ts`

### Implementation for User Story 1

- [X] T008 [P] [US1] Implement `estimateTokens` in `src/context/tokens.ts` with `Math.floor(chars / 4)` semantics and reusable helper functions for non-negative estimates
- [X] T009 [US1] Aggregate actual input-token usage across model callbacks in `src/agents/metrics.ts` and record `null` when any observed model call lacks usable input-token data
- [X] T010 [US1] Wire `promptTokens` into the `/chat` response flow and preserve the existing response fields in `src/http/server.ts`
- [X] T011 [US1] Update the chat service contract test coverage in `src/http/server.test.ts` to assert `promptTokens` is returned as `null` or a valid integer without replacing it with estimates

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently.

---

## Phase 4: User Story 2 - Understand estimated context sources (Priority: P1)

**Goal**: Provide per-source context estimates and keep the estimates separate from actual `promptTokens`.

**Independent Test**: Submit a request with multiple source buckets and verify each key in `contextBreakdown` matches the floor of its included text length divided by four, while `promptTokens` stays actual usage or `null`.

### Tests for User Story 2

- [X] T012 [P] [US2] Add failing tests for `contextBreakdown` aggregation in `src/http/server.test.ts`
- [X] T013 [P] [US2] Add failing tests for repeated source contributions and empty-source handling in `src/context/tokens.test.ts`

### Implementation for User Story 2

- [X] T014 [P] [US2] Add source-based estimation helpers in `src/context/tokens.ts` for `request`, `history`, `memories`, `toolResults`, and `reflection` keys
- [X] T015 [US2] Merge context source estimates into strategy metrics and final response payloads in `src/agents/react.ts`, `src/agents/plan-and-execute.ts`, and `src/agents/reflection.ts`
- [X] T016 [US2] Validate the `contextBreakdown` contract in `src/services/chat-service.ts` and `src/http/server.ts` so estimates are non-negative integers and remain distinct from `promptTokens`

**Checkpoint**: At this point, User Stories 1 and 2 should both work independently.

---

## Phase 5: User Story 3 - Review usage across a long conversation (Priority: P2)

**Goal**: Surface the real per-turn prompt usage in the long-running conversation script without fabricating values.

**Independent Test**: Run the script against a stubbed local chat response and assert each successful turn prints the real `promptTokens` value or an explicit unavailable marker.

### Tests for User Story 3

- [X] T017 [P] [US3] Add a focused script-level test in `src/http/server.test.ts` or `scripts/conversa-longa.test.ts` for successful turns and failed requests

### Implementation for User Story 3

- [X] T018 [US3] Update `scripts/conversa-longa.sh` to print `metrics.promptTokens` for every successful turn and render `n/a` or equivalent when usage is unavailable
- [X] T019 [US3] Verify the script still exits on failed chat responses and does not count malformed or error payloads as successful turns

**Checkpoint**: The feature is now independently testable end-to-end through the long conversation flow.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final validation pass, documentation alignment, and full regression coverage.

- [X] T020 [P] Run the focused measurement validation and full project checks in `npm test` and `npm run typecheck`
- [X] T021 [P] Refresh the validation guide in `specs/010-context-token-metrics/quickstart.md` to match the final metric names and output expectations

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - blocks all user story work
- **User Story 1 (Phase 3)**: Depends on Foundational completion
- **User Story 2 (Phase 4)**: Depends on Foundational completion and may run in parallel with User Story 1
- **User Story 3 (Phase 5)**: Depends on Foundational completion and can run in parallel with Story 1/Story 2 after the response contract is stable
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (US1)**: No dependency on other stories; validates the actual usage contract independently
- **User Story 2 (US2)**: No dependency on other stories; validates source estimates independently
- **User Story 3 (US3)**: Depends on the chat API contract already in place; validates the operator script output independently

### Within Each User Story

- Tests must be written before implementation
- Core collection logic before boundary serialization
- Response contract before script output updates
- Story complete before moving to the next priority

### Parallel Opportunities

- `T002` can run in parallel with `T001`
- `T004` and `T005` can run in parallel after `T003`
- `T006` and `T007` can run in parallel within US1
- `T012` and `T013` can run in parallel within US2
- `T017` can run in parallel with the US1 and US2 validation tasks once the response contract is stable
- `T020` and `T021` can run in parallel during final validation

---

## Parallel Example: User Story 1

```bash
# Launch the two US1 test tasks in parallel
Task: "Add failing unit tests for estimateTokens boundaries and zero-value handling in src/context/tokens.test.ts"
Task: "Add failing strategy tests for complete and incomplete actual usage aggregation in src/agents/metrics.test.ts"

# Launch the two US1 implementation tasks in parallel once the tests are failing
Task: "Implement estimateTokens in src/context/tokens.ts with Math.floor(chars / 4) semantics"
Task: "Aggregate actual input-token usage across model callbacks in src/agents/metrics.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Verify the actual `promptTokens` contract and missing-usage behavior independently
5. Extend to User Story 2 and User Story 3 only after the request total is correct

### Incremental Delivery

1. Implement the shared estimator and collector for actual usage.
2. Serialize the metrics into `/chat` without changing existing fields.
3. Add source-specific estimates and ensure they remain diagnostic.
4. Update the long-conversation script to print actual prompt usage for every successful turn.
5. Run the targeted validation pass and project-wide typecheck/test commands.
