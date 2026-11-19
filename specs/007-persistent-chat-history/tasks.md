# Tasks: Persistent Chat History

**Input**: Design documents from `specs/007-persistent-chat-history/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Included because the project constitution requires tests for every new behavior, with isolated SQLite persistence tests and deterministic HTTP/strategy tests.

**Organization**: Tasks are grouped by the three user stories in `spec.md`. Story 1 and 2 are P1; Story 3 is P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: The task can run in parallel with other marked tasks in the same phase because it edits a separate file and has no incomplete prerequisite.
- **[Story]**: User-story traceability label; setup and foundational tasks have none.
- Every task description names its exact implementation or test file.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Reuse the existing TypeScript, Express, SQLite, Zod, and `node:test` project setup. No packages, scripts, or project scaffolding need to be added.

No setup tasks are required; proceed with the existing project configuration.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define the shared conversation persistence and error contracts required by all user stories.

- [X] T001 [P] Define the `ConversationStore`, conversation message type, role union (`user | assistant`), `create`, `append`, `lastMessages`, and `close` contract in `src/store/conversation-store.ts`; message records MUST have a required conversation ID, non-empty content, integer sequence, and ISO timestamp as specified in `specs/007-persistent-chat-history/data-model.md`.
- [X] T002 [P] Add an `UnknownConversationError` domain error in `src/agents/errors.ts` for supplied IDs that do not identify a conversation.

**Checkpoint**: Shared types and expected domain error are available to the store, service, HTTP boundary, and tests.

---

## Phase 3: User Story 1 - Resume a conversation (Priority: P1)

**Goal**: Continue a known conversation using its prior messages, in chronological order, capped at the latest 12, and return the same conversation ID with the history count.

**Independent Test**: Pre-create a conversation with a deterministic store, submit a request with its ID, and verify the fake strategy receives the ordered prior transcript followed by the current message; verify the response retains the ID and reports the exact prior-history count.

### Tests for User Story 1

- [X] T003 [P] [US1] Add `:memory:` SQLite tests for conversation creation and ordered `append`/`lastMessages` behavior, including retrieval within the 12-message cap, conversation/message fields (`id` unique stable identifier, `createdAt` ISO timestamp text, `role` `user | assistant`, non-empty `content`, integer `sequence`, and required `conversationId` reference), and message persistence across operations and chat requests on the same store in `src/store/sqlite-conversation-store.test.ts`.
- [X] T004 [P] [US1] Add chat-service tests with a fake strategy and fake store that assert history is loaded before the current user message is appended, the strategy receives chronological history followed by the current request, the assistant answer is appended after strategy success, and the correct history and `historyMessages` counts for 0, fewer than 12, exactly 12, and more than 12 prior messages in `src/services/chat-service.test.ts`.
- [X] T005 [P] [US1] Add HTTP integration tests for a known conversation ID that verify the returned ID and `metrics.historyMessages`, using a deterministic fake strategy and isolated store in `src/http/server.test.ts`.

### Implementation for User Story 1

- [X] T006 [US1] Implement `SqliteConversationStore` in `src/store/sqlite-conversation-store.ts` with static conversations/messages tables, a foreign key, an integer per-conversation message sequence, bound SQL parameters, `:memory:` support, validated row mapping, `create`, `append`, `lastMessages`, and `close`; return the latest requested messages in chronological order and reject missing conversations.
- [X] T007 [US1] Implement chat orchestration in `src/services/chat-service.ts`: load up to 12 prior messages before appending the current user message, pass the role-tagged history alongside the current request to the selected strategy, append the assistant answer after strategy success, and return `historyMessages` as the prior history length.
- [X] T008 [US1] Extend the request and successful-response schemas and route in `src/http/server.ts` to accept a known `conversationId`, call the chat service, return `conversationId` plus `metrics.historyMessages`, and preserve existing answer, trace, metrics, strategy, reflection, and timeout behavior.

**Checkpoint**: A caller can resume an existing conversation and verify that only the latest 12 prior messages are used.

---

## Phase 4: User Story 2 - Start a conversation (Priority: P1)

**Goal**: Let a caller omit the conversation ID, create a conversation automatically, and receive an ID that can be used for later requests.

**Independent Test**: Submit a request without an ID, verify a successful response contains a new ID and zero history messages, then submit a follow-up with that ID and verify it is reused.

### Tests for User Story 2

- [X] T009 [US2] Add deterministic HTTP tests for a request without `conversationId`, asserting that a conversation is created, the response returns its ID with `metrics.historyMessages: 0`, and the first exchange is persisted in `src/http/server.test.ts`.

### Implementation for User Story 2

- [X] T010 [US2] Update `src/services/chat-service.ts` to accept an omitted conversation ID, call `ConversationStore.create()` before loading history, and use the returned ID for message persistence and the successful result; preserve the known-ID resume path.

**Checkpoint**: A caller can start a conversation and use its returned identifier to continue it.

---

## Phase 5: User Story 3 - Keep conversation histories separate (Priority: P2)

**Goal**: Prevent cross-conversation context mixing and return a clear error for an unknown supplied ID without creating a replacement conversation.

**Independent Test**: Create two conversations with distinct histories and continue each; verify each strategy call receives only its own history. Submit an unknown ID and verify a client error and no new conversation.

### Tests for User Story 3

- [X] T011 [US3] Add store and HTTP tests for two isolated conversation histories and an unknown supplied ID, verifying that the unknown request does not create a conversation or invoke the strategy in `src/store/sqlite-conversation-store.test.ts` and `src/http/server.test.ts`.

### Implementation for User Story 3

- [X] T012 [US3] Map `UnknownConversationError` to the documented `404` response (`UNKNOWN_CONVERSATION`) in `src/http/server.ts` and ensure the route does not create a conversation when a caller supplies an unknown ID.

**Checkpoint**: Conversation histories remain isolated and unknown IDs fail explicitly.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Wire production lifecycle, keep the existing public contract aligned, and validate the complete feature.

- [X] T013 [P] Wire the configured SQLite conversation store into `createChatApp` from `src/index.ts` and close it with the existing application server lifecycle.
- [X] T014 [P] Update the existing `POST /chat` contract in `specs/002-chat-api/contracts/http-chat.md` to document optional `conversationId`, response `conversationId`, and `metrics.historyMessages` while retaining all existing strategy, reflection, and error behavior.
- [X] T015 Run the feature scenarios in `specs/007-persistent-chat-history/quickstart.md`, then run `npm run test` and `npm run typecheck`; resolve any failures in the relevant `src/store/`, `src/services/`, `src/http/`, or `src/index.ts` files.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No changes required; existing project scripts and dependencies are reused.
- **Foundational (Phase 2)**: Starts immediately; both contract and error definitions can be implemented in parallel.
- **User Stories (Phases 3-5)**: Begin after Phase 2. Story 1 creates the persistence and resume path; Story 2 adds creation on omitted ID; Story 3 adds explicit HTTP translation and validates isolation.
- **Polish (Phase 6)**: Depends on the three user stories because it wires the final store lifecycle, reconciles the existing contract, and validates the complete behavior.

### User Story Dependencies

- **User Story 1 (P1)**: Depends on the shared store/error contracts in Phase 2. It can be tested with a pre-created conversation and is independently useful for callers that already have an ID.
- **User Story 2 (P1)**: Depends on the `ConversationStore.create()` implementation from User Story 1; enables callers to obtain their initial ID through chat.
- **User Story 3 (P2)**: Depends on User Story 1's store and orchestration. It verifies separation and adds the final client-facing unknown-ID mapping.

### Parallel Execution Examples

Foundational tasks edit different files:

```text
T001 ConversationStore contract in src/store/conversation-store.ts
T002 UnknownConversationError in src/agents/errors.ts
```

User Story 1 test files can be prepared in parallel after Phase 2:

```text
T003 SQLite persistence tests in src/store/sqlite-conversation-store.test.ts
T004 Chat-service orchestration tests in src/services/chat-service.test.ts
T005 HTTP resume tests in src/http/server.test.ts
```

After tests are specified, the SQLite store and chat service have separate files and can be implemented in parallel:

```text
T006 SqliteConversationStore in src/store/sqlite-conversation-store.ts
T007 Chat orchestration in src/services/chat-service.ts
```

User Story 2 and 3 test work can be prepared independently after their prerequisite behavior exists, but tasks editing `src/http/server.test.ts` should be coordinated in one worktree to avoid overlapping edits.

## Implementation Strategy

### MVP First

1. Complete Phase 2 shared contracts.
2. Complete Phase 3, including the in-memory SQLite store, chat orchestration, and resume endpoint.
3. Validate User Story 1 with its deterministic tests.
4. Complete Phase 4 so callers can create conversations through the endpoint.
5. Complete Phase 5 for explicit unknown-ID handling and conversation isolation.

### Incremental Delivery

1. Add the ability to resume a known conversation and prove the 12-message context behavior.
2. Add automatic conversation creation when the ID is omitted.
3. Confirm histories are isolated and invalid IDs fail clearly.
4. Wire production lifecycle, update the existing API contract, and run full tests and typecheck.

### Final Format Validation

All task entries use `- [ ]`, a sequential `T###` ID, a `[P]` marker only where parallel work is possible, a required `[US#]` label only in story phases, and an explicit file path.
