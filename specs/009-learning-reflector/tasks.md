---
description: "Implementation tasks for the Safe Learning Reflector feature"
---

# Tasks: Safe Learning Reflector

**Input**: Design documents from `/specs/009-learning-reflector/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/chat-learning-tools.md`

**Tests**: Tests are included because the feature specification and project constitution require tests for new behavior.

**Organization**: Tasks are grouped by user story for independent implementation and verification.

## Phase 1: Setup

**Purpose**: Project structure and dependencies are already initialized. Reuse the existing TypeScript, LangChain, memory-store, and test setup; no setup changes are needed.

## Phase 2: Foundational

**Purpose**: Existing user-scoped `MemoryStore` and chat request validation provide the prerequisites. No shared blocking infrastructure changes are required.

**Checkpoint**: User stories can be implemented independently against the existing store and injected test seams.

---

## Phase 3: User Story 1 - Retain useful preferences safely (Priority: P1) 🎯 MVP

**Goal**: After a successful response, assess only the latest user message and asynchronously retain at most one explicit, durable, non-sensitive fact or preference.

**Independent Test**: With injected assessment and memory-store fakes, verify durable facts are saved for the correct user, transient or secret-like candidates are not saved, and the HTTP response completes without waiting for assessment.

### Tests for User Story 1

- [X] T001 [P] [US1] Add learning-reflector tests for structured `{ hasLearning, fact }` outcomes, latest-user-message-only input, transient requests, secret-like candidates, and no-write outcomes in `src/services/learning-reflector.test.ts`.
- [X] T002 [P] [US1] Add HTTP tests proving a successful `/chat` response is sent before the learning reflector resolves and background failures are reported without changing the response in `src/http/server.test.ts`.

### Implementation for User Story 1

- [X] T003 [US1] Implement the Zod-validated `{ hasLearning: boolean, fact: string | null }` assessment in `src/services/learning-reflector.ts`; inspect only `message`, never `answer` or chat history, and persist at most one explicit durable fact through `MemoryStore.remember`.
- [X] T004 [US1] Enforce conservative secret and transient-candidate exclusion before persistence in `src/services/learning-reflector.ts`; do not log message or candidate content and propagate failures for the HTTP background reporter.
- [X] T005 [US1] Ensure the production `/chat` composition starts learning only after a successful response and retains injectable reflector/error-reporter seams in `src/http/server.ts`; ensure the production default uses the existing `MemoryStore`.

**Checkpoint**: User Story 1 is independently verifiable with `src/services/learning-reflector.test.ts` and `src/http/server.test.ts`; no one-time request or secret-like candidate is written, and response completion does not wait for learning.

---

## Phase 4: User Story 2 - Forget a learned preference (Priority: P1)

**Goal**: Let an agent remove one unambiguous preference from only the current user's memories, while asking for clarification and making no change when the target is missing or ambiguous.

**Independent Test**: Use scoped fake memory operations to verify a unique preference match deletes only that user's memory, while zero or multiple matches delete nothing and produce a clarification outcome.

### Tests for User Story 2

- [X] T006 [P] [US2] Add memory-tool tests for `forget_preference` input validation, one unique match, no match, multiple matches, and zero deletion on ambiguous outcomes in `src/agents/memory-tools.test.ts`.
- [X] T007 [P] [US2] Add chat-service tests proving preference matching and deletion are restricted to the validated request user's memories in `src/services/chat-service.test.ts`.
- [X] T008 [P] [US2] Add plan-and-execute coverage proving the `forget_preference` operation is represented and invoked with validated arguments in `src/agents/plan-and-execute.test.ts`.

### Implementation for User Story 2

- [X] T009 [US2] Extend `ReasoningMemoryOperations` with user-scoped preference lookup and update the chat-service adapter to use only `MemoryStore.recall(userId, preference)` results in `src/agents/reasoning.ts` and `src/services/chat-service.ts`.
- [X] T010 [US2] Replace the exact-ID-only forgetting tool with `forget_preference`, validate a non-empty preference description, use user-scoped recall results at the existing inclusive `0.30` threshold and three-result cap, delete only when exactly one result matches, and return a clarification result without mutation for zero or multiple matches in `src/agents/memory-tools.ts`.
- [X] T011 [US2] Add `forget_preference` to the plan-and-execute tool schema and planner/replanner instructions, preserving the rule that the user ID is bound by application scope and never supplied by model arguments in `src/agents/reasoning.ts` and `src/agents/plan-and-execute.ts`.

**Checkpoint**: User Story 2 is independently verifiable with `src/agents/memory-tools.test.ts`, `src/services/chat-service.test.ts`, and `src/agents/plan-and-execute.test.ts`; only a unique match belonging to the current user is removed.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Run project quality gates and make sure the quickstart scenarios remain accurate.

- [X] T012 [P] Align the runnable scenarios with the final behavior and existing scripts in `specs/009-learning-reflector/quickstart.md`.
- [X] T013 Run the complete test suite with `npm run test` and the TypeScript check with `npm run typecheck` from `package.json`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No changes required; repository and dependencies already exist.
- **Foundational (Phase 2)**: No changes required; existing request validation and user-scoped memory operations are available.
- **User Stories (Phase 3+)**: Both depend on the existing project foundation and can proceed independently.
- **Polish (Phase 5)**: Depends on the selected user stories being implemented.

### User Story Dependencies

- **User Story 1 (P1)**: Independent; uses the existing `MemoryStore.remember` operation.
- **User Story 2 (P1)**: Independent of US1; extends the existing request-scoped memory operations and agent tools.

### Within Each User Story

- Write and run tests before implementation.
- For US1, service eligibility and structured-output behavior precede HTTP wiring verification.
- For US2, the request-scoped memory-operation interface precedes the tool and plan-and-execute integration.

### Parallel Opportunities

- T001 and T002 can be developed in parallel because they modify separate test files.
- T006, T007, and T008 can be developed in parallel because they target separate test files.
- US1 and US2 can be implemented in parallel after confirming they do not concurrently edit the same files; if working in parallel, keep the `reasoning.ts` changes in T009 and T011 coordinated.
- T012 can be completed independently after behavior is settled.

## Parallel Example: User Story 1

```text
Task: T001 - Add reflector unit tests in src/services/learning-reflector.test.ts
Task: T002 - Add post-response/error-reporting tests in src/http/server.test.ts
```

## Parallel Example: User Story 2

```text
Task: T006 - Add tool behavior tests in src/agents/memory-tools.test.ts
Task: T007 - Add user-scope adapter tests in src/services/chat-service.test.ts
Task: T008 - Add planner integration tests in src/agents/plan-and-execute.test.ts
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete T001 and T002 and confirm the tests fail for the missing requirements.
2. Complete T003–T005.
3. Validate US1 independently with its service and HTTP tests.

### Incremental Delivery

1. Deliver US1 for safe automatic learning without response delay.
2. Deliver US2 for user-controlled forgetting with ambiguity protection.
3. Run the complete cross-cutting validation in T012–T013.

## Notes

- Every task uses the required checkbox, sequential task ID, story label for story-specific work, and explicit file path.
- `[P]` marks work on distinct files that can proceed concurrently.
- No new storage, API route, or dependency is planned.
