# Tasks: Conversation History Summarization

**Input**: Design documents from `/specs/011-conversation-summarization/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm feature inputs and add implementation boundaries without changing runtime behavior.

- [X] T001 Review the summarization requirements in specs/011-conversation-summarization/spec.md and implementation decisions in specs/011-conversation-summarization/research.md.
- [X] T002 [P] Define the summarized-history types and summarizer abstraction in src/store/conversation-store.ts and src/services/chat-service.ts.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add persistent summary storage and validated contracts required by every user story.

**CRITICAL: No user story work can begin until this phase is complete.**

- [X] T003 Add the `conversation_summaries` table with `conversation_id TEXT PRIMARY KEY REFERENCES conversations(id)`, non-empty `summary`, positive `summarized_through_sequence`, and `updated_at TEXT NOT NULL` in src/store/sqlite-conversation-store.ts.
- [X] T004 Extend src/store/conversation-store.ts with the `ConversationSummary` schema and methods for `summary`, `messagesThrough`, and atomic summary replacement plus watermark advancement.
- [X] T005 Implement summary read, message range, and atomic upsert behavior for `ConversationSummary` in src/store/sqlite-conversation-store.ts.
- [X] T006 Add `summarize` to the validated trace union in src/agents/reasoning.ts and src/http/server.ts with `conversationId`, `summary`, and positive `summarizedThroughSequence` fields.
- [X] T007 Add deterministic test coverage for `conversation_summaries`, isolation, sequence watermarks, atomic replacement, and failure-safe state in src/store/sqlite-conversation-store.test.ts.

**Checkpoint**: Summary persistence and contracts are ready.

---

## Phase 3: User Story 1 - Maintain a usable merged summary (Priority: P1) 🎯 MVP

**Goal**: Retain the newest 8 prior messages directly and merge retired message batches into one persisted summary that is included before recent context.

**Independent Test**: With 16 prior messages, run one chat request and verify that the oldest 8 are merged, the newest 8 remain direct history, and the persisted summary appears before the direct history.

### Tests for User Story 1

> Write these tests first and verify they fail before implementation.

- [X] T008 [P] [US1] Add store tests for creating the first summary and restoring it with `summarizedThroughSequence` in src/store/sqlite-conversation-store.test.ts.
- [X] T009 [P] [US1] Add service tests proving the 8-message recent window plus summary-before-history context in src/services/chat-service.test.ts.
- [X] T010 [P] [US1] Add deterministic merge tests that preserve decisions, facts, and pending items in an approximately 150-token result in src/services/chat-service.test.ts.
- [X] T011 [US1] Add HTTP contract coverage for a validated `summarize` trace event and existing response fields in src/http/server.test.ts.

### Implementation for User Story 1

- [X] T012 [US1] Implement a deterministic or injectable service-level summarizer interface that merges an existing summary with one chronological batch in src/services/chat-service.ts.
- [X] T013 [US1] Implement pruning selection in src/services/chat-service.ts so only messages older than the newest 8 prior messages and newer than the persisted watermark are eligible.
- [X] T014 [US1] Change direct history assembly to a maximum of 8 messages and include the persisted summary before them in src/services/chat-service.ts.
- [X] T015 [US1] Merge all complete newly eligible batches in chronological order, replace the one summary row atomically, and advance the watermark through the last retired sequence in src/store/sqlite-conversation-store.ts.
- [X] T016 [US1] Add the successful refresh to result trace and context breakdown estimation after the summary is persisted in src/services/chat-service.ts and src/http/server.ts.

**Checkpoint**: User Story 1 can independently preserve and resume merged summary context.

---

## Phase 4: User Story 2 - Refresh only at 8-message boundaries (Priority: P1)

**Goal**: Prevent summarizer calls and persistence writes unless another complete group of 8 messages has crossed the pruning boundary.

**Independent Test**: Exercise 1, 7, and 8 additional retired messages with repeated requests and verify no refresh occurs before 8 and exactly one refresh for a completed boundary.

### Tests for User Story 2

- [X] T017 [P] [US2] Add boundary tests for 0–7, exactly 8, and multiple complete 8-message batches in src/services/chat-service.test.ts.
- [X] T018 [P] [US2] Add repeated-request tests proving the same summary and watermark remain unchanged without a new summarizer call in src/services/chat-service.test.ts.
- [X] T019 [US2] Add concurrent in-memory SQLite request coverage proving only one persisted summary update for the same boundary in src/store/sqlite-conversation-store.test.ts.

### Implementation for User Story 2

- [X] T020 [US2] Track refresh eligibility from `summarized_through_sequence` and process only complete 8-message groups in src/services/chat-service.ts.
- [X] T021 [US2] Make the summary upsert and watermark update conditional on the expected current watermark so concurrent requests cannot duplicate a boundary in src/store/sqlite-conversation-store.ts.
- [X] T022 [US2] Ensure repeated requests return the existing summary without calling the summarizer or writing storage outside a completed boundary in src/services/chat-service.ts.

**Checkpoint**: User Stories 1 and 2 provide persisted context and no-op boundary behavior.

---

## Phase 5: User Story 3 - Observable and deterministic summarization (Priority: P2)

**Goal**: Emit one successful summary event and retain failures, history, and recent context safely without external model access in tests.

**Independent Test**: Run deterministic tests covering success, no-op, failure, event count, persistence, and concurrency without contacting an external model.

### Tests for User Story 3

- [X] T023 [P] [US3] Add tests for a successful `summarize` event containing `conversationId`, non-empty `summary`, and positive persisted sequence in src/services/chat-service.test.ts and src/http/server.test.ts.
- [X] T024 [P] [US3] Add no-event and no-write tests outside the 8-message boundary in src/services/chat-service.test.ts.
- [X] T025 [US3] Add summarizer failure coverage proving the previous summary, watermark, and 8-message direct history remain intact in src/services/chat-service.test.ts.

### Implementation for User Story 3

- [X] T026 [US3] Translate summarizer failures through an explicit domain error boundary while retaining the previous summary and message history in src/services/chat-service.ts and src/agents/errors.ts.
- [X] T027 [US3] Emit exactly one `summarize` trace event only after atomic persistence succeeds in src/services/chat-service.ts.
- [X] T028 [US3] Add a deterministic summarizer implementation for tests that accepts existing summary plus chronological batch and returns a merged approximately 150-token summary in src/services/chat-service.test.ts or src/agents/model.ts.

**Checkpoint**: Summary activity is observable, deterministic tests avoid external models, and failure state is preserved.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Complete validation, documentation, and regression checks.

- [X] T029 [P] Update the chat response documentation and quickstart validation steps in specs/011-conversation-summarization/quickstart.md.
- [X] T030 [P] Add HTTP response assertions for direct `historyMessages` semantics remaining capped at 8 in src/http/server.test.ts.
- [X] T031 Run `npm run typecheck` and `npm run test` and resolve failures related to the feature in package scripts.
- [X] T032 [P] Review the implementation against specs/011-conversation-summarization/spec.md, data-model.md, contracts/chat-history-summarization.md, and verify no secret or `.env` content is committed.

---

## Dependencies & Execution Order

### Phase Dependencies

- Phase 1 setup has no dependencies.
- Phase 2 foundational storage and contracts blocks every user story.
- Phases 3–5 depend on Phase 2 and may proceed independently after foundation completion.
- Phase 6 depends on all desired user stories.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2; no dependency on US2 or US3 implementation, although US2 adds boundary guarantees and US3 adds observability.
- **US2 (P1)**: Starts after Phase 2; integrates with the summary service from US1.
- **US3 (P2)**: Starts after Phase 2; integrates with successful persistence and event behavior from US1.

### Parallel Opportunities

- T002 can run alongside setup review.
- T003–T006 are implementation boundaries that should not be edited simultaneously; T007 can follow them.
- Within US1, T008–T011 test tasks are independent and can run in parallel.
- Within US2, T017–T019 test tasks are independent.
- Within US3, T023–T025 test tasks are independent.
- Polish tasks T029, T030, and T032 can run in parallel.

## Parallel Example: User Story 1

```text
T008: Store summary restoration tests
T009: Service direct-window and summary-context tests
T010: Deterministic merged-summary tests
T011: HTTP summarize trace contract tests
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phases 1–2.
2. Complete Phase 3, User Story 1.
3. Validate summary creation, merge, persistence, and 8-message context independently.
4. Add boundary enforcement from US2 and observability/failure handling from US3.

### Incremental Delivery

1. Foundation → summary persistence and validated trace contract.
2. US1 → persistent merged summaries and context inclusion.
3. US2 → 8-message refresh guarantees and concurrency protection.
4. US3 → visible events and deterministic failure-safe tests.
5. Polish → full typecheck, test suite, and documentation validation.
