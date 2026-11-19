# Tasks: Semantic User Memory

**Input**: Design documents from `/specs/008-semantic-memory/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/http-chat-and-memory.md`, `quickstart.md`

**Tests**: Included because the project constitution and feature requirements require unit, HTTP, persistence, and meaning-based recall coverage.

**Organization**: Tasks are grouped by user story. The shared embedding, persistence, and request-validation contracts are foundational prerequisites.

## Format

Every task uses `- [ ] Tnnn [P?] [USn?] Description with an exact file path`. `[P]` marks tasks that can proceed independently on separate files; user-story tasks include their required story label.

## Phase 1: Setup

**Purpose**: Add the local embedding runtime dependency.

- [X] T001 Add `@huggingface/transformers` as a runtime dependency and update the lockfile in `package.json` and `package-lock.json`.

---

## Phase 2: Foundational

**Purpose**: Establish the shared memory, embedding, SQLite, and chat request contracts that block all user stories.

- [X] T002 Define validated memory records, normalized 384-dimensional embedding types, the `MemoryStore` interface, and explicit memory domain errors in `src/memory/memory-store.ts`; require non-empty `userId` and fact, a 1,536-byte float32 BLOB, and UTC ISO-8601 `createdAt`.
- [X] T003 [P] Add unit tests for lazy singleton initialization, shared concurrent initialization, mean pooling, normalization, and 384-dimensional output in `src/memory/embeddings.test.ts`.
- [X] T004 Implement the lazy singleton local feature-extraction pipeline for `onnx-community/all-MiniLM-L6-v2-ONNX` with CPU fp32, mean pooling, and `normalize: true` in `src/memory/embeddings.ts`.
- [X] T005 [P] Add in-memory SQLite tests for the `memories` table, `(user_id, created_at)` index, 1,536-byte BLOB round trips, and rejection of malformed vectors in `src/memory/memory-store.test.ts`.
- [X] T006 Implement SQLite initialization for `memories(id, user_id, fact, embedding, created_at)`, its user/time index, exact float32 BLOB serialization, and configured database lifecycle in `src/memory/memory-store.ts`.
- [X] T007 Add HTTP tests proving that `/chat` rejects missing, blank, and invalid `userId` with HTTP 400 before invoking a strategy or memory store in `src/http/server.test.ts`.
- [X] T008 Require a non-empty `userId` in the `/chat` Zod request schema and pass the validated identifier through the chat service boundary in `src/http/server.ts` and `src/services/chat-service.ts`.
- [X] T009 Add injectable memory-store configuration and production lifecycle wiring using the configured SQLite database, while preserving test injection and close behavior, in `src/http/server.ts` and `src/index.ts`.

**Checkpoint**: Shared schema, embedding, database, and request-scope contracts are ready; story work can proceed.

---

## Phase 3: User Story 1 - Recall relevant personal facts (Priority: P1)

**Goal**: Provide up to three semantically relevant saved facts as scoped context to chat, including when a query shares no words with a fact.

**Independent Test**: Seed a user's memory, send a semantically related chat query with no words in common, and verify the selected strategy receives the relevant fact; also verify ranking, threshold, and top-three behavior with deterministic vectors.

### Tests for User Story 1

- [X] T010 [P] [US1] Add memory-store tests for descending dot-product ranking, inclusive `0.30` threshold, deterministic ties, and a maximum of three recall results in `src/memory/memory-store.test.ts`.
- [X] T011 [P] [US1] Add chat-service tests proving recall runs for the validated user and supplies only eligible facts to the strategy in `src/services/chat-service.test.ts`.
- [X] T012 [P] [US1] Add an opt-in local-model integration test that recalls a relevant fact from a query with no shared words and runs without remote model loading in `src/memory/semantic-recall.integration.test.ts`.

### Implementation for User Story 1

- [X] T013 [US1] Implement user-scoped memory recall using normalized-vector dot products, descending score order, inclusive `0.30` minimum, deterministic ties, and a three-result cap in `src/memory/memory-store.ts`.
- [X] T014 [US1] Embed the current chat query, call recall with the request `userId`, and pass the result as separate contextual data to the selected strategy in `src/services/chat-service.ts` and `src/agents/reasoning.ts`.
- [X] T015 [US1] Add explicit delimiting of recalled facts as untrusted context without treating them as instructions in both supported agent strategies in `src/agents/react.ts` and `src/agents/plan-and-execute.ts`.

**Checkpoint**: A chat request can use relevant stored facts without requiring lexical overlap, and no more than three eligible facts enter the strategy context.

---

## Phase 4: User Story 2 - Learn durable facts (Priority: P1)

**Goal**: Deduplicate saved facts, support explicit API creation, and learn durable preferences asynchronously after successful chat responses.

**Independent Test**: Save equivalent facts above the strict `0.92` threshold through the API and through a completed chat turn; verify one memory remains and the chat response does not wait for learning.

### Tests for User Story 2

- [X] T016 [P] [US2] Add store tests proving same-user facts with similarity strictly greater than `0.92` deduplicate, similarity equal to `0.92` does not deduplicate, and distinct facts insert separately in `src/memory/memory-store.test.ts`.
- [X] T017 [P] [US2] Add `POST /memories` contract tests for valid creation, duplicate response, malformed user/fact input, and response schema in `src/http/server.test.ts`.
- [X] T018 [P] [US2] Add learning-reflector tests for concise durable fact extraction, no-memory outcomes, and reportable failures in `src/services/learning-reflector.test.ts`.
- [X] T019 [P] [US2] Add chat HTTP tests proving a successful response completes before asynchronous learning and the learned fact is available to a subsequent recall in `src/http/server.test.ts`.

### Implementation for User Story 2

- [X] T020 [US2] Implement deduplicating `remember(userId, fact)` with a strict dot-product comparison greater than `0.92`, retaining the existing row when duplicate, in `src/memory/memory-store.ts`.
- [X] T021 [US2] Implement `POST /memories` with Zod-validated `userId` and non-empty trimmed `fact`, HTTP 201 for creation, and HTTP 200 with `created: false` for a duplicate in `src/http/server.ts`.
- [X] T022 [US2] Implement a learning reflector that extracts only concise durable facts or preferences from a completed chat turn and calls the shared deduplicating memory operation in `src/services/learning-reflector.ts`.
- [X] T023 [US2] Schedule learning after the successful `/chat` response without awaiting it, preserve the response on reflector failure, and explicitly report background failures in `src/http/server.ts`.

**Checkpoint**: Users can save memories through both chat learning and the explicit API without duplicate rows or response delay.

---

## Phase 5: User Story 3 - Forget a saved fact (Priority: P1)

**Goal**: Remove one identified memory via chat language or explicit HTTP deletion, and do not delete when a chat target is ambiguous.

**Independent Test**: Save multiple facts, forget exactly one through each supported interface, and verify only the selected fact disappears; an ambiguous chat request must leave all facts intact.

### Tests for User Story 3

- [X] T024 [P] [US3] Add store tests for exact owner-and-memory deletion, unknown ID behavior, unchanged unrelated rows, and user-scoped memory listing for candidate resolution in `src/memory/memory-store.test.ts`.
- [X] T025 [P] [US3] Add agent/tool tests proving natural-language forget uses the request-scoped owner, removes one identified fact, and asks for clarification without deletion when multiple facts match in `src/agents/memory-tools.test.ts`.
- [X] T026 [P] [US3] Add HTTP tests for owned memory deletion returning 204, unknown or other-user IDs returning the same generic 404, and missing user ID returning 400 in `src/http/server.test.ts`.

### Implementation for User Story 3

- [X] T027 [US3] Implement owner-scoped memory listing and `forget(userId, memoryId)` requiring both identifiers, with the same not-found result for absent and foreign-owned IDs, in `src/memory/memory-store.ts`.
- [X] T028 [US3] Add request-scoped memory tools that use the injected `userId`, let the assistant identify one forget target from that user's facts, and require clarification instead of deleting ambiguous targets in `src/agents/memory-tools.ts`, `src/services/chat-service.ts`, `src/agents/react.ts`, and `src/agents/plan-and-execute.ts`.
- [X] T029 [US3] Implement `DELETE /memories/:memoryId?userId=...` with validated path/query values, HTTP 204 on deletion, and generic HTTP 404 on no owner-and-ID match in `src/http/server.ts`.

**Checkpoint**: A user can forget one of their own facts in chat or over HTTP, without affecting other facts or exposing another user's memory.

---

## Phase 6: User Story 4 - Keep memories private to each user (Priority: P1)

**Goal**: Ensure no recall, deduplication, or deletion operation crosses user boundaries.

**Independent Test**: Seed equivalent and distinct facts for two user IDs; verify each user's recall results and deletion effects are restricted to their own rows, and an invalid/missing ID prevents store access.

### Tests for User Story 4

- [X] T030 [P] [US4] Add two-user persistence tests covering identical facts, recall isolation, deduplication scope, and foreign-owner deletion in `src/memory/memory-store.test.ts`.
- [X] T031 [P] [US4] Add HTTP tests proving each chat request receives only its owner's facts and that no memory read or mutation occurs for a missing or invalid `userId` in `src/http/server.test.ts`.

### Implementation for User Story 4

- [X] T032 [US4] Audit every memory select, duplicate check, listing, and delete statement to require exact `user_id` scoping, then fix any query that fails the two-user tests in `src/memory/memory-store.ts`.
- [X] T033 [US4] Verify request scope cannot be overridden by model-generated tool arguments and is bound to the current chat's `userId` in `src/agents/memory-tools.ts` and `src/services/chat-service.ts`.

**Checkpoint**: Cross-user memory access is prevented for chat, creation, recall, deduplication, and deletion.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Confirm end-to-end readiness and document local-model test setup.

- [X] T034 [P] Document model cache provisioning, opt-in offline semantic integration test command, and expected outcomes in `specs/008-semantic-memory/quickstart.md`.
- [ ] T035 Run `npm run typecheck`, `npm test`, and the opt-in local-model semantic recall scenario, then resolve feature-related failures in `src/**/*.ts`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 updates the runtime dependency and lockfile; it is required before using the embedding pipeline.
- **Foundational (Phase 2)**: T002-T009 define shared schemas, persistence, embeddings, required chat scope, and dependency wiring; all user stories depend on this phase.
- **User Stories (Phase 3+)**: All start after Phase 2. The memory recall, remember, forget, and privacy stories are individually testable against the shared foundation.
- **Polish (Phase 7)**: Depends on the stories selected for delivery; the full validation task T035 should run after all four stories.

### User Story Dependencies

- **US1 (P1)**: Depends only on the foundation. It is the recommended MVP and exposes memory context to chat.
- **US2 (P1)**: Depends on the foundation; its asynchronous learning path integrates with the chat request scope from Phase 2 and can be developed alongside US1 where files do not overlap.
- **US3 (P1)**: Depends on the foundation; explicit deletion can be developed independently, while natural-language forgetting consumes the request-scoped memory operations.
- **US4 (P1)**: Depends on implementations from US1-US3 and adds cross-cutting verification that all operations remain user-scoped.

### Within Each User Story

- Write tests before implementing their behavior; make tests fail first.
- Implement persistence/service behavior before wiring the relevant HTTP or agent surface.
- Run the story's focused tests before its checkpoint.

### Parallel Opportunities

- T003 and T005 can run independently after T002 because they are separate test files.
- Within US1, T010, T011, and T012 target separate test files; implementation T013-T015 is sequential because the service and strategy depend on the store/context contract.
- Within US2, T016 and T018 target separate test files and can run in parallel; T017 and T019 share `src/http/server.test.ts` and should be implemented sequentially. T020 must precede T021; T022 can proceed independently after the shared memory interface, and T023 depends on T022.
- Within US3, T024-T026 target separate tests and can run in parallel; T027 must precede T028-T029.
- Within US4, T030 and T031 target separate test files and can run in parallel; fixes follow the test findings.
- T034 is documentation-only and can run in parallel with final test execution once API behavior is stable.

## Implementation Strategy

1. Complete setup and the shared foundation.
2. Deliver US1 as the smallest user-visible MVP: semantic recall wired into chat with deterministic store tests and the opt-in local-model no-word-overlap integration test.
3. Add US2 learning and explicit creation without changing the recall contract.
4. Add US3 explicit and conversational forgetting.
5. Complete US4 cross-user isolation verification and any query fixes.
6. Run the quickstart validations and project quality gates.

**Suggested MVP**: Deliver US1 together with the explicit creation slice of US2 (`POST /memories` and `remember`) so users can populate facts and immediately validate semantic recall. Asynchronous learning and forgetting can follow without blocking the core value.
