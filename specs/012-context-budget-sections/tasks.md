# Tasks: Context Budget by Section

**Input**: Design documents from `/specs/012-context-budget-sections/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story so each story can be implemented and validated independently.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Confirm the implementation baseline and create the feature's test location.

- [X] T001 Verify baseline context metrics and strategy prompt assembly paths in src/context/tokens.ts and src/agents/ (react.ts, plan-and-execute.ts, reflection.ts)
- [X] T002 Create the focused ContextBuilder test module src/context-builder.test.ts with imports and test placeholders

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the shared budget primitives required by every user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Define positive-integer budget parsing for CONTEXT_BUDGET_SUMMARY, CONTEXT_BUDGET_HISTORY, and CONTEXT_BUDGET_MEMORIES plus defaults 100, 300, and 100 in src/context-builder.ts
- [X] T004 [P] Add immutable System and current-message types plus budgeted summary, history, and memory input types to src/context-builder.ts
- [X] T005 Implement summary truncation and estimated-budget measurement using src/context/tokens.ts in src/context-builder.ts
- [X] T006 Implement oldest-first history removal and lowest-score-first memory removal while preserving retained relative order in src/context-builder.ts
- [X] T007 Add explicit invalid-budget handling without silent fallback in src/context-builder.ts

**Checkpoint**: Foundation ready; ContextBuilder rules are available to all strategies.

---

## Phase 3: User Story 1 - Controlar o tamanho de cada seção do contexto (Priority: P1) 🎯 MVP

**Goal**: Apply separate section budgets while preserving system and current-message content.

**Independent Test**: Build a context with low summary, history, and memory budgets and verify immutable content, oldest-first history cuts, and lowest-score memory cuts.

### Tests for User Story 1 (required) ⚠️

> Write these tests before implementation and confirm they fail before completing the story.

- [X] T008 [P] [US1] Add tests that system and current request remain byte-for-byte unchanged in src/context-builder.test.ts
- [X] T009 [P] [US1] Add low-budget tests for summary 200, oldest-first history 1200, and lowest-score memory 300 ordering in src/context-builder.test.ts
- [X] T010 [P] [US1] Add edge tests for empty/short sections, configuration invalidity, and equal memory-score determinism in src/context-builder.test.ts

### Implementation for User Story 1

- [X] T011 [US1] Export the ContextBuilder input/output contract, validate input values, and resolve environment budgets in src/context-builder.ts
- [X] T012 [US1] Assemble immutable system and message sections plus bounded summary, history, and memory sections in src/context-builder.ts
- [X] T013 [US1] Return section estimates and budgets consistently with src/context/tokens.ts for callers and metrics

**Checkpoint**: User Story 1 passes low-budget and immutability tests independently.

---

## Phase 4: User Story 2 - Aplicar orçamento a todas as estratégias (Priority: P2)

**Goal**: Ensure every strategy builds model prompts through the same ContextBuilder rules.

**Independent Test**: Run React and plan-and-execute with excessive summary, history, and memory content and verify identical bounded sections.

### Tests for User Story 2 (required) ⚠️

- [X] T014 [P] [US2] Add strategy-input tests for React using the centralized bounded sections in src/agents/react.test.ts or src/context-builder.test.ts
- [X] T015 [P] [US2] Add strategy-input tests for plan-and-execute using the centralized bounded sections in src/agents/plan-and-execute.test.ts or src/context-builder.test.ts
- [X] T016 [P] [US2] Add reflection coverage proving critic prompts receive bounded context through src/agents/reflection.test.ts

### Implementation for User Story 2

- [X] T017 [US2] Integrate ContextBuilder assembly into React prompt construction and update context metrics in src/agents/react.ts
- [X] T018 [US2] Integrate ContextBuilder assembly into plan-and-execute request construction and update context metrics in src/agents/plan-and-execute.ts
- [X] T019 [US2] Integrate bounded ContextBuilder output into reflection critic context construction in src/agents/reflection.ts
- [X] T020 [US2] Route any future strategy prompt assembly through the ContextBuilder contract by documenting or exporting the shared entry point in src/context-builder.ts

**Checkpoint**: React, plan-and-execute, and reflection produce consistent section budgets.

---

## Phase 5: User Story 3 - Verificar cortes com limites baixos em testes (Priority: P3)

**Goal**: Provide deterministic automated proof that low budgets cut in the required order.

**Independent Test**: Execute focused low-budget tests and inspect resulting summary, retained history, and retained memories.

### Tests for User Story 3 (required) ⚠️

- [X] T021 [P] [US3] Add deterministic summary low-budget assertions in src/context-builder.test.ts
- [X] T022 [P] [US3] Add a history test with multiple old/new entries proving oldest entries are removed first in src/context-builder.test.ts
- [X] T023 [P] [US3] Add a memory test with distinct scores proving lowest scores are removed before higher scores in src/context-builder.test.ts
- [X] T024 [P] [US3] Add environment-name coverage for CONTEXT_BUDGET_SUMMARY, CONTEXT_BUDGET_HISTORY, and CONTEXT_BUDGET_MEMORIES in src/context-builder.test.ts

### Implementation for User Story 3

- [X] T025 [US3] Finalize deterministic tie handling and stable result ordering in src/context-builder.ts
- [X] T026 [US3] Add explicit low-budget test fixtures and assertions for all registered strategies in src/context-builder.test.ts

**Checkpoint**: All deterministic low-budget scenarios pass and invalid configuration is covered.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Validate the complete feature and documentation.

- [X] T027 [P] Update environment examples to CONTEXT_BUDGET_SUMMARY=100, CONTEXT_BUDGET_HISTORY=300, and CONTEXT_BUDGET_MEMORIES=100 in .env.example
- [X] T028 [P] Run the focused ContextBuilder tests with npm run test -- src/context-builder.test.ts
- [X] T029 Run the full npm run test suite and npm run typecheck
- [X] T030 Validate the quickstart scenarios in specs/012-context-budget-sections/quickstart.md

## Phase 7: Final Configuration Correction

- [X] T031 Replace legacy window configuration with corrected summary/history/memory defaults, immutable system semantics, and aligned tests/documentation

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; can start immediately.
- **Foundational (Phase 2)**: Depends on Setup and BLOCKS every user story.
- **User Stories (Phases 3-5)**: Depend on Foundational completion; can proceed in priority order or in parallel after their tests are defined.
- **Polish (Phase 6)**: Depends on all desired user stories.

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Phase 2; no dependency on other stories and is the MVP.
- **User Story 2 (P2)**: Can start after Phase 2; consumes US1's ContextBuilder contract.
- **User Story 3 (P3)**: Can start after Phase 2; validates US1 behavior and strategy integration.

### Within Each User Story

- Write required tests first and ensure they fail before implementation.
- Implement the builder or integration in story order.
- Run the story-focused tests before advancing.

### Parallel Opportunities

- T004 may proceed in parallel with independent test setup after foundational types are agreed.
- US1 tests T008-T010 are parallel.
- US2 strategy tests T014-T016 are parallel.
- US3 deterministic tests T021-T024 are parallel.
- Documentation and test commands in Phase 6 may proceed in parallel where environment-independent.

---

## Parallel Example: User Story 1

```powershell
# Run independent US1 test creation tasks together
# T008, T009, and T010 target src/context-builder.test.ts but represent separate test cases.

# After tests fail, implement src/context-builder.ts in T011-T013.
```

## Parallel Example: User Story 2

```powershell
# Independent strategy coverage
# T014 React
# T015 plan-and-execute
# T016 reflection

# Then integrate each strategy in T017-T019.
```

## Parallel Example: User Story 3

```powershell
# Run the deterministic low-budget test additions T021-T024 together,
# then finalize ordering in T025-T026.
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational ContextBuilder primitives.
3. Complete Phase 3: User Story 1.
4. Run focused US1 tests.
5. Stop and validate the bounded-context MVP before strategy integration.

### Incremental Delivery

1. Deliver User Story 1 as the isolated context-budget behavior.
2. Add User Story 2 strategy integration.
3. Add User Story 3 deterministic low-budget regression coverage.
4. Finish with full-suite, typecheck, quickstart, and documentation validation.
