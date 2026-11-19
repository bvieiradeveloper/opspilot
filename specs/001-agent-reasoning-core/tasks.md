---

description: "Task list for OpsPilot reasoning core"
---

# Tasks: Núcleo de Raciocínio do OpsPilot

**Input**: Design documents from `specs/001-agent-reasoning-core/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Test tasks are included because the specification requires deterministic store and trace tests, and the constitution requires tests for new behavior. Model-backed unit tests use injected fakes and do not access the network.

**Organization**: Tasks are grouped by user story to enable independent implementation and verification.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Task can run in parallel with other marked tasks because it changes a different file and has no dependency on their incomplete work.
- **[Story]**: User story label, required for story phase tasks.
- Each task includes its target file path.

## Phase 1: Setup

**Purpose**: Confirm project initialization and existing dependencies.

Node.js, TypeScript, test/typecheck scripts, LangChain, LangGraph, Zod, and `tsx` are already configured in `package.json`. No setup task or dependency installation is needed for this feature.

---

## Phase 2: Foundational

**Purpose**: Create the domain store and shared error/types that US1-US3 depend on. Complete this phase before story implementation.

- [x] T001 [P] Write deterministic store tests in `src/agents/store.test.ts` asserting exactly five distinct seeded services, six alerts with exactly three `firing` and three `resolved`, valid service references, stable seed IDs/timestamps, and repeatable baseline initialization.
- [x] T002 [P] Define `Service`, `Alert`, and `Incident` domain types and status schemas in `src/agents/domain.ts`; preserve the data-model constraints: service `id` and `name` are non-empty and unique, alert `serviceId` references a seeded service, alert status is `firing | resolved`, and incident status transitions from `open` to `resolved`.
- [x] T003 [P] Add typed domain errors for invalid input, unknown service, and unknown or already-resolved incident in `src/agents/errors.ts`, without exposing internal details at user-facing boundaries.
- [x] T004 Implement the process-local store and canonical seed in `src/agents/store.ts`, satisfying `src/agents/store.test.ts` and `data-model.md`: exactly five services and six varied alerts (three firing, three resolved), fixed seed timestamps, unique stable IDs, incidents with trimmed non-empty `title` and `severity`, a `serviceId` referencing an existing service, `open -> resolved` transitions, and an injectable clock for incident timestamps.

**Checkpoint**: Store and domain errors pass deterministic tests without network access; later stories can use isolated seeded store instances.

---

## Phase 3: User Story 1 - Executar estratégias de raciocínio (Priority: P1)

**Goal**: Establish the shared strategy result contract, safe trace formatting, per-run LLM-call/latency metrics, and one shared OpenRouter model factory.

**Independent Test**: Using deterministic fake model calls, verify typed answer/trace/metrics behavior, stable trace formatting for every event kind, per-run call counting, and model configuration validation without making network calls.

### Tests for User Story 1

- [x] T005 [P] [US1] Write deterministic trace-formatting tests in `src/agents/trace.test.ts` for all six event types, stable event order, action tool/args rendering, and safe summary-only `thought`/`critique` output.
- [x] T006 [P] [US1] Write metrics tests in `src/agents/metrics.test.ts` verifying each model-start event increments `IICalls`, separate runs do not share counts, and elapsed `latencyMs` is non-negative without network access.
- [x] T007 [P] [US1] Write model-factory configuration tests in `src/agents/model.test.ts` verifying required environment values, OpenRouter base URL, configured model, temperature zero, and safe failure for missing values without printing the key.

### Implementation for User Story 1

- [x] T008 [P] [US1] Define `ReasoningStrategy`, `ReasoningInput`, `ReasoningResult`, `Metrics`, and the discriminated `TraceEvent` union in `src/agents/reasoning.ts`; include `name`, `run(input)`, `answer`, `trace`, `IICalls`, and `latencyMs`, with `maxIterations` an integer from 1 to 8.
- [x] T009 [US1] Implement pure, deterministic trace formatting in `src/agents/trace.ts`, covering `thought`, `action`, `observation`, `plan`, `critique`, and `answer`; action output must include tool and args, and reasoning summaries must not expose private model reasoning.
- [x] T010 [US1] Implement a per-run LangChain callback and monotonic latency measurement in `src/agents/metrics.ts`; count `handleChatModelStart` events into `IICalls` and never share mutable counters between strategy executions.
- [x] T011 [US1] Implement the single OpenRouter `ChatOpenAI` factory in `src/agents/model.ts`, validating `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` with Zod, setting `configuration.baseURL` to `https://openrouter.ai/api/v1` and `temperature` to `0`, and never reading `.env` or logging credentials.
- [x] T012 [P] [US1] Write deterministic ReAct trace tests in `src/agents/react.test.ts` verifying tool action/observation/final answer ordering and omission of intermediate assistant reasoning.
- [x] T013 [US1] Implement the ReAct strategy adapter in `src/agents/react.ts` using `createReactAgent` from the installed `@langchain/langgraph/prebuilt` compatibility export, `createModel()` from `src/agents/model.ts`, shared tools, a `recursionLimit` safety guard, `maxIterations`-bounded tool execution, per-run model-call metrics, and safe `messagesToTrace` conversion.

**Checkpoint**: Shared contracts, formatting, metrics, configured model, and ReAct trace adapter are independently testable without network calls.

---

## Phase 4: User Story 2 - Resolver uma solicitação com planejamento e ferramentas (Priority: P1)

**Goal**: Provide validated alert/incident tools and a Plan-and-Execute graph that plans, executes one step, replans, and stops at completion or the configured cap.

**Independent Test**: With a seeded store and injected deterministic planner/replanner runnables, exercise listing alerts, opening and resolving incidents, one-action execution, replanning, completion, invalid-input non-mutation, and the eight-step maximum without OpenRouter access.

### Tests for User Story 2

- [x] T014 [P] [US2] Write tool tests in `src/agents/tools.test.ts` for `list_alerts` with and without status, `open_incident`, and `resolve_incident`; assert Zod rejection for invalid status, missing/empty fields, unknown service/incident, and no state mutation after rejected operations.
- [x] T015 [P] [US2] Write Plan-and-Execute graph tests in `src/agents/plan-and-execute.test.ts` with injected deterministic planner/replanner runnables, asserting one tool action per executor pass, replanning after each result, termination on an empty plan, the requested interaction cap, hard maximum eight, malformed-plan rejection, ordered trace, and LLM call counts.

### Implementation for User Story 2

- [x] T016 [US2] Implement Zod-validated `list_alerts`, `open_incident`, and `resolve_incident` tools in `src/agents/tools.ts` over `src/agents/store.ts`; list by optional `firing | resolved` status, require trimmed non-empty incident title/service/severity, require an existing service, and resolve only an existing open incident.
- [x] T017 [US2] Implement the planner/executor/replanner `StateGraph` in `src/agents/plan-and-execute.ts`, using structured Zod outputs, injected planner/replanner dependencies with the shared model factory as production defaults, one tool action per executor node, replan after each action, stop on no remaining steps, enforce `maxIterations` from 1 to 8 and hard cap eight, and set a separate LangGraph recursion guard.

**Checkpoint**: Run the graph against the seeded store with fake model runnables; confirm all tool and planning scenarios pass offline.

---

## Phase 5: User Story 3 - Avaliar estratégias e preparar dados operacionais (Priority: P2)

**Goal**: Expose the repeatable seed command and arena CLI to compare one or more strategies on the same request.

**Independent Test**: Use fake registered strategies to verify CLI parsing, same-input sequential execution, independent formatted results, metrics, and non-zero errors; run the seed command twice and verify the same five-service/six-alert counts without accumulation.

### Tests for User Story 3

- [x] T018 [P] [US3] Write seed-command tests in `src/scripts/seed.test.ts` asserting the command uses the canonical store seed, reports five services and six alerts (three `firing`, three `resolved`), and repeated runs reconstruct the same baseline without duplicates.
- [x] T019 [P] [US3] Write arena CLI tests in `src/arena.test.ts` for positional request validation, comma-separated `--strategies`, `--max-iterations` bounds/default, unknown strategies, identical input to every selected strategy, sequential output, per-strategy traces/metrics, and non-zero failure status.

### Implementation for User Story 3

- [x] T020 [US3] Implement the standalone seed verification command in `src/scripts/seed.ts` using the canonical seeded store; print deterministic service/alert counts and statuses without credentials or network calls.
- [x] T021 [P] [US3] Add the `seed` command to `package.json` as `"seed": "tsx src/scripts/seed.ts"`, preserving all existing scripts.
- [x] T022 [US3] Implement the arena CLI in `src/arena.ts` with Zod-validated arguments, a strategy registry containing `react` and `plan-and-execute`, comma-separated `--strategies`, `--max-iterations` default 8/range 1-8, sequential runs on the same request, and separate answer/trace/`IICalls`/`latencyMs` output; report invalid arguments or strategy failures safely with a non-zero exit code.

**Checkpoint**: `npm run seed` reports the canonical dataset; fake-strategy arena tests pass without network; a live smoke run uses OpenRouter only when valid environment credentials are supplied.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the completed feature against project quality gates and its runnable guide.

- [x] T023 Run `npm test`, `npm run typecheck`, `npm run seed`, and the non-network scenarios in `specs/001-agent-reasoning-core/quickstart.md`; fix failures in `package.json` and `src/**/*.ts`, then run a live arena smoke check only when OpenRouter credentials are already available in the process environment.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No new project initialization is needed; the repository already has Node.js/TypeScript scripts and all required packages.
- **Foundational (Phase 2)**: T001-T003 can be developed in parallel; T004 waits for the domain types, errors, and store tests. This phase blocks all story implementation.
- **User Story 1 (Phase 3)**: Starts after T004. T005-T008 and the independent ReAct trace test T012 are parallelizable; T009 depends on T005/T008, T010 on T006/T008, T011 on T007, and T013 on T012/T011.
- **User Story 2 (Phase 4)**: Follows US1 because the graph consumes its strategy/model/metrics contracts. T014 and T015 can be authored in parallel; T016 follows T014, and T017 follows T015/T016 and uses US1 model/metrics.
- **User Story 3 (Phase 5)**: Seed tests and arena tests (T018/T019) can be authored in parallel after their referenced contracts are available. T020 follows T018 and T004; T021 can run alongside T020; T022 follows T019 and US1/US2 strategies.
- **Polish (Phase 6)**: T023 depends on all desired stories being complete.

### User Story Dependencies

- **US1 (P1)**: Starts after foundational store/types/errors; independent of US2/US3 for offline contract, formatter, metrics, and model-configuration verification.
- **US2 (P1)**: Uses the shared contracts and model factory from US1 plus the foundational store. Its graph can be tested with injected runnables and does not require live OpenRouter access.
- **US3 (P2)**: Seed behavior uses the foundational store. The arena boundary can be tested with fake strategies, while its production registry uses ReAct from US1 and Plan-and-Execute from US2.

### Parallel Opportunities

- Foundation: T001, T002, and T003 target separate files and can proceed in parallel; T004 is the integration point.
- US1: T005, T006, T007, T008, and T012 target separate test/contract files and can proceed in parallel; each implementation follows its relevant test/contract.
- US1: T012 is a pure trace test for ReAct; T013 follows it and completes before US3 registers the strategy.
- US2: T014 and T015 are separate test files and can be authored in parallel; implementations follow their tests.
- US3: T018 and T019 are separate test files and can be authored in parallel. T020 and T021 modify separate files and can proceed in parallel after T018 is in place.

## Parallel Examples

### User Story 1

Run these independent test/contract tasks together:

- `T005` in `src/agents/trace.test.ts`
- `T006` in `src/agents/metrics.test.ts`
- `T007` in `src/agents/model.test.ts`
- `T008` in `src/agents/reasoning.ts`

### User Story 2

Author the two independent test files together before implementing either behavior:

- `T014` in `src/agents/tools.test.ts`
- `T015` in `src/agents/plan-and-execute.test.ts`

### User Story 3

Author seed and arena tests together; after seed tests are established, seed source and package command are separate-file work:

- `T018` in `src/scripts/seed.test.ts` with `T019` in `src/arena.test.ts`
- `T020` in `src/scripts/seed.ts` with `T021` in `package.json`

## Implementation Strategy

### MVP First

The smallest useful operational MVP is **Foundational + US1 + US2**: it yields a real Plan-and-Execute strategy that can be exercised offline with injected model runnables and a deterministic store. US1 alone establishes reusable contracts and adapters but has no concrete incident strategy. Add US3 next for the seed command and terminal arena used for comparison and smoke testing.

### Incremental Delivery

1. Complete Foundational tasks and validate the seeded store.
2. Complete US1; validate formatting, metrics, and model configuration without network.
3. Complete US2; validate real tool behavior and graph flow with injected fakes.
4. Complete US3; run seed and fake-strategy arena checks, then optional OpenRouter smoke test.
5. Run `npm run test` and `npm run typecheck` before considering the feature complete.
