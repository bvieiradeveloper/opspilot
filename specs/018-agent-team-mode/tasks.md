---
description: "Task list for Agent Team Mode"
---

# Tasks: Agent Team Mode

**Input**: Design documents from `specs/018-agent-team-mode/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/team-mode.md`, `quickstart.md`

**Tests**: Included because the project constitution requires tests for every new behavior.

**Organization**: Tasks are grouped by user story. Test tasks precede the implementation they verify.

## Format

Every implementation task uses `- [ ] T### [P?] [US#?] Description with exact file path`. `[P]` appears only when the task can proceed independently without editing the same files or depending on incomplete work.

## Phase 1: Setup

**Purpose**: Prepare project infrastructure.

No setup or dependency changes are required. The repository already has TypeScript, Zod, LangChain/LangGraph, `tsx`, and test/typecheck scripts.

---

## Phase 2: Foundational Contracts

**Purpose**: Establish validated team state and handoff event shapes used by the stories.

- [X] T001 [P] Add unit tests for team-role, blackboard, and supervisor-decision schemas in `src/team/types.test.ts`; cover non-empty request and brief, `next` values `analyst`, `planner`, `executor`, `done`, and `out_of_scope`, and handoff count from 0 through 8.
- [X] T002 Implement Zod schemas and inferred types for team roles, blackboard, role assignment, supervisor decision, and run outcome in `src/team/types.ts`; require a non-empty request and brief, allow `next` values `analyst`, `planner`, `executor`, `done`, and `out_of_scope`, and constrain handoff count to 0 through 8.
- [X] T003 [P] Add HTTP response validation tests for a handoff event with `type: "handoff"`, `node: "team"`, allowed source/destination roles, and a non-empty brief in `src/http/server.test.ts`; test handoff formatting in `src/agents/trace.test.ts`.
- [X] T004 Add the `handoff` trace-event type and formatter, and validate the event at the HTTP response boundary in `src/agents/reasoning.ts`, `src/agents/trace.ts`, and `src/http/server.ts`.

**Checkpoint**: Shared team state and handoff events have validated contracts before orchestration and UI work begins.

---

## Phase 3: User Story 1 - Coordinate an incident response (Priority: P1) - MVP

**Goal**: Let an operator explicitly select team mode and receive an incident response coordinated across analyst, planner, and executor roles over shared context.

**Independent Test**: Select the team route for an incident, inject deterministic role and supervisor results, and verify shared context reaches subsequent roles and an incident response is returned. Submit a non-incident request and verify team mode declines it.

### Tests for User Story 1

- [X] T005 [P] [US1] Add team-graph tests for role transitions, shared blackboard context, final response, and out-of-scope requests in `src/team/team-graph.test.ts`.
- [X] T006 [P] [US1] Add production-graph tests that explicit `team` selection bypasses automatic routing and invokes the team strategy in `src/graph/production-graph.test.ts`.
- [X] T007 [P] [US1] Add web chat tests that team mode is selectable and submits `strategy: "team"` in `web/src/components/Chat.test.tsx` and `web/src/services/chat-api.test.ts`.

### Implementation for User Story 1

- [X] T008 [US1] Implement the structured supervisor decision using `next` and a non-empty `brief`, including specialist roles and explicit terminal/out-of-scope outcomes, in `src/team/supervisor.ts`.
- [X] T009 [US1] Implement analyst, planner, and executor role runners that consume the shared blackboard and return validated findings, plans, or execution results in `src/team/roles.ts`.
- [X] T010 [US1] Implement the team graph loop over the blackboard, dispatch role assignments from the supervisor, preserve shared context, and produce the final answer and handoff trace in `src/team/team-graph.ts`.
- [X] T011 [US1] Expose a team strategy factory that composes the supervisor, role runners, model factory, and injected test dependencies in `src/team/index.ts`.
- [X] T012 [US1] Add `team` to explicit supported-route selection and production-graph dispatch without adding it to automatic routing in `src/agents/reasoning.ts` and `src/graph/production-graph.ts`.
- [X] T013 [US1] Pass the selected `team` strategy through chat-service validation and HTTP strategy/request-trace route schemas in `src/services/chat-service.ts`, `src/http/server.ts`, and `src/store/request-trace-store.ts`.
- [X] T014 [US1] Add accessible team-mode selection to the War Room chat and include the selected strategy in the API request in `web/src/components/Chat.tsx`, `web/src/services/chat-api.ts`, and `web/src/models/chat.ts`.

**Checkpoint**: An operator can explicitly start a team incident run, get a bounded-format answer, and decline requests outside incident scope.

---

## Phase 4: User Story 3 - Keep role actions within limits (Priority: P1)

**Goal**: Enforce role permissions and stop after at most eight handoffs without a ninth role dispatch or permission bypass.

**Independent Test**: Verify the analyst cannot propose or mutate, the planner receives no tools, the executor has only approval-aware incident operations, and a run at eight handoffs stops without emitting a ninth.

### Tests for User Story 3

- [X] T015 [P] [US3] Add role-capability tests proving analyst access is read-only with no action proposals, planner has no tools, and executor receives only approval-aware incident operations in `src/team/roles.test.ts`.
- [X] T016 [US3] Add boundary tests proving the graph stops before requesting another supervisor decision at eight handoffs, emits no ninth handoff, and dispatches no ninth role in `src/team/team-graph.test.ts`.
- [X] T017 [P] [US3] Add HTTP tests proving legacy chat cannot invoke team mode with unguarded incident mutation tools and blocked executor actions do not bypass approval checks in `src/http/server.test.ts`.

### Implementation for User Story 3

- [X] T018 [US3] Enforce the analyst, planner, and executor capability matrix by constructing restricted tool sets in `src/team/roles.ts`; analyst tools must be read-only, planner tools must be absent, and executor mutations must use approval-aware incident tools only.
- [X] T019 [US3] Enforce the eight-handoff limit before requesting another supervisor decision in `src/team/team-graph.ts`; reaching eight must stop coordination, emit no ninth handoff, dispatch no ninth role, and preserve completed versus incomplete work in the outcome.
- [X] T020 [US3] Reject team strategy on the legacy chat path when the approval-aware War Room execution context is unavailable in `src/http/server.ts`; return an explicit non-success response without running direct-mutation tools.

**Checkpoint**: Permission boundaries and the handoff ceiling hold even when a role or supervisor requests an invalid action or extra transition.

---

## Phase 5: User Story 2 - Review team handoffs (Priority: P2)

**Goal**: Show operator-safe handoff events in the existing "Ver raciocínio" trace panel.

**Independent Test**: Render a trace containing one handoff and verify its order, source role, destination role, and brief; verify that no hidden internal reasoning is displayed.

### Tests for User Story 2

- [X] T021 [P] [US2] Add trace-panel tests for readable, ordered handoff rendering with source, destination, and brief in `web/src/components/TracePanel.test.tsx`.
- [X] T022 [P] [US2] Add request-trace integration coverage proving a handoff event survives response completion and retrieval in `src/http/request-tracing.test.ts`.

### Implementation for User Story 2

- [X] T023 [US2] Add a typed handoff event to the web trace model and render a dedicated human-readable handoff label and brief in `web/src/models/trace.ts` and `web/src/components/TraceEvent.tsx`.

**Checkpoint**: Operators can inspect persisted handoffs in the existing trace panel without seeing private internal reasoning.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the integrated feature and keep the design/run documentation accurate.

- [X] T024 Run the feature scenarios in `specs/018-agent-team-mode/quickstart.md` and correct any directly related API, graph, trace, or UI failures in the corresponding source and test files.
- [X] T025 Run `npm run test`, `npm run typecheck`, and `npm run web:typecheck` from the repository root and resolve failures caused by this feature in the affected files.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No tasks; dependencies and scripts already exist.
- **Foundational (Phase 2)**: Blocks all user-story implementation because role/blackboard and handoff types are shared contracts.
- **User Story 1 (Phase 3)**: Depends on Phase 2; delivers explicit team selection and incident coordination.
- **User Story 3 (Phase 4)**: Depends on Phase 2 and the graph/roles created in US1; it is a release gate for the P1 MVP because it enforces safe operations and the maximum handoff count.
- **User Story 2 (Phase 5)**: Depends on the backend handoff trace contract from Phase 2; can build its UI against fixtures, and its end-to-end persistence check requires US1 handoffs.
- **Polish (Phase 6)**: Depends on all stories selected for delivery.

### User Story Dependencies

- **US1 (P1)**: Starts after Phase 2. Establishes runnable team orchestration and its explicit route.
- **US3 (P1)**: Starts after US1's role and graph interfaces exist. Must be complete before deploying the MVP; P1 safety requirements are not optional.
- **US2 (P2)**: Its renderer can be developed independently against a handoff fixture after Phase 2; end-to-end trace validation depends on a generated handoff from US1.

### Parallel Opportunities

- T001 and T003 can run in parallel because they add tests in separate files.
- T005, T006, and T007 can run in parallel after foundational contracts.
- T015 and T017 can run in parallel; T016 shares the graph test file with US1 work and should follow T005.
- T021 and T022 can run in parallel because they cover separate UI and API trace paths.
- Do not parallelize tasks that edit the same file, notably `src/team/roles.ts`, `src/team/team-graph.ts`, `src/http/server.ts`, or `src/team/team-graph.test.ts`.

## Parallel Examples

### User Story 1

```text
Task: T005 team graph behavior tests in src/team/team-graph.test.ts
Task: T006 explicit production route tests in src/graph/production-graph.test.ts
Task: T007 chat selection/API payload tests in web/src/components/Chat.test.tsx and web/src/services/chat-api.test.ts
```

### User Story 3

```text
Task: T015 role capability tests in src/team/roles.test.ts
Task: T017 legacy route/approval safety tests in src/http/server.test.ts
```

### User Story 2

```text
Task: T021 handoff UI tests in web/src/components/TracePanel.test.tsx
Task: T022 persisted trace retrieval test in src/http/request-tracing.test.ts
```

## Implementation Strategy

### MVP First

1. Complete Phase 2 shared contracts.
2. Complete Phase 3 to deliver explicit team selection and coordinated incident handling.
3. Complete Phase 4 before enabling or deploying the MVP; US3 is a mandatory P1 safety and bounded-execution gate.
4. Validate the two P1 stories independently before adding the P2 trace-view polish.

### Incremental Delivery

1. Phase 2 establishes schemas and trace contracts.
2. US1 adds the explicit team route and shared-board coordination.
3. US3 hardens role capabilities and enforces the eight-handoff ceiling; the combined P1 increment is the deployable MVP.
4. US2 renders and validates persisted handoffs for operators.
5. Phase 6 runs quickstart and project quality checks.
