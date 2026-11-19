# Tasks: SQLite Operations Persistence

**Input**: Design documents from
`/specs/003-sqlite-operations-persistence/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/ops-store-and-tools.md`

**Tests**: Required by the specification and constitution. Write regression and feature tests
before implementation and verify they fail for the intended missing behavior.

**Organization**: Tasks are grouped by user story to allow incremental implementation and
verification. Shared domain types and store contracts are established in the foundational phase.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Ensure local persistent data stays out of version control.

- [X] T001 [P] Add `/data/` to `.gitignore` without changing existing ignore rules

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Define shared domain types, persistence contract, and canonical persistent seed
before implementing either store.

- [X] T002 Update `src/agents/domain.ts` with Service tier and Alert/Incident severity enums
  using exactly `sev1 | sev2 | sev3`; add nullable `resolvedAt` and `summary` to Incident and
  define the Runbook schema and types
- [X] T003 Create `src/store/ops-store.ts` exporting the synchronous `OpsStore` contract,
  `IncidentFilter` (`open | mitigated | resolved | all`), alert filter types, and service/runbook types
  consumed by both store implementations
- [X] T004 Create `src/store/seed-data.ts` with exactly five canonical services, six alerts
  (three `firing`, three `resolved`) and checkout/payment/auth runbooks; give every service and
  alert severity/tier one of `sev1 | sev2 | sev3`, preserve stable IDs/timestamps, and include
  no `catalog-api` persistent service

**Checkpoint**: Shared types, API contract, and deterministic persistent fixture are available.

---

## Phase 3: User Story 1 - Preserve operational state (Priority: P1) — MVP

**Goal**: Persist and seed the canonical operational records in SQLite and retain state across
store reopens and application restarts.

**Independent Test**: Construct a file-backed SQLite store, verify schema and seed counts, open
and resolve an incident, close and reopen the store, then verify service, alert, incident status,
`resolvedAt`, and nullable `summary` persisted; initialize twice and verify no duplicate seed
records.

### Tests for User Story 1

- [X] T005 [US1] Add `src/store/sqlite-ops-store.test.ts` tests for isolated `:memory:`
  initialization, all four tables, exact seed counts (five services, six alerts with three
  firing and three resolved, three runbooks), idempotent initialization, and reopening a
  file-backed store without losing records
- [X] T006 [US1] Add `src/store/sqlite-ops-store.test.ts` lifecycle tests proving an incident
  opens with `status = open`, `resolvedAt = null`, and `summary = null`, then resolves with
  `status = resolved`, a populated `resolvedAt`, and `summary = null` that survive reopening;
  include the legal `mitigated` state by inserting a valid test incident fixture

### Implementation for User Story 1

- [X] T007 [US1] Implement `SqliteOpsStore` in `src/store/sqlite-ops-store.ts` using
  `DatabaseSync`, creating parent directories for file paths but not `:memory:`, and defining
  idempotent DDL for exactly `services`, `alerts`, `incidents`, and `runbooks` with primary,
  unique, foreign-key, nullable-column, and CHECK constraints; CHECK tier/severity against
  exactly `sev1 | sev2 | sev3`, alert status against `firing | resolved`, and incident status
  against `open | mitigated | resolved`
- [X] T008 [US1] Seed the rows from `src/store/seed-data.ts` transactionally in
  `src/store/sqlite-ops-store.ts` with stable-key `ON CONFLICT ... DO NOTHING` statements so
  repeated initialization does not duplicate or overwrite operator records
- [X] T009 [US1] Implement prepared-statement-backed `listServices`, `listAlerts`,
  `listIncidents`, `openIncident`, and `resolveIncident` in `src/store/sqlite-ops-store.ts`;
  bind every input, validate mapped rows with Zod, preserve domain errors, and expose explicit
  store close behavior
- [X] T010 [US1] Add a production store factory in `src/store/sqlite-ops-store.ts` that reads
  `OPSPILOT_DB` with default `./data/opspilot.db`, inject it into production strategies from
  `src/agents/index.ts` and `src/index.ts`, and use it in `src/scripts/seed.ts` without changing
  the benchmark's mock-store factory

**Checkpoint**: Persistent startup, seed, core listing, incident lifecycle, and restart behavior
pass independently.

---

## Phase 4: User Story 2 - Inspect and manage incidents (Priority: P1)

**Goal**: Let an operator or agent list incidents by lifecycle status, defaulting to open only.

**Independent Test**: Against `SqliteOpsStore(':memory:')`, create open and resolved incidents;
verify the tool defaults to open and returns exact matching arrays for `open`, `resolved`, and
`all`, while invalid statuses are rejected before querying.

### Tests for User Story 2

- [X] T011 [US2] Update `src/agents/tools.test.ts` to construct `SqliteOpsStore(':memory:')`
  and cover `list_incidents` default-open behavior, `open`, `mitigated`, `resolved`, and `all` filters,
  invalid filter rejection, and returned incident serialization
- [X] T012 [US2] Extend `src/store/sqlite-ops-store.test.ts` to verify database CHECK
  constraints reject invalid service tier, alert and incident severity, alert status, and
  incident status values using the store's actual schema

### Implementation for User Story 2

- [X] T013 [US2] Implement the optional `IncidentFilter` parameter and bound prepared
  statements for `listIncidents` in `src/store/sqlite-ops-store.ts` for `open | mitigated |
  resolved | all`, preserving deterministic ordering and all-record behavior when the store
  method receives no filter
- [X] T014 [US2] Add the `list_incidents` LangChain tool to `src/agents/tools.ts` with a
  Zod-described `status` field enumerating `open | mitigated | resolved | all`, default `open`,
  and a description that explains the default and when to request each filter
- [X] T015 [US2] Revise descriptions and field schemas for `list_alerts`, `open_incident`, and
  `resolve_incident` in `src/agents/tools.ts`; call `.describe()` for every input field, list
  all closed values/defaults, explain when and when not to open an incident, and document
  mutation preconditions and side effects

**Checkpoint**: Incident listing and lifecycle tool contracts pass using isolated SQLite memory.

---

## Phase 5: User Story 3 - Consult seeded operational guidance (Priority: P2)

**Goal**: Retrieve only the runbook associated with the requested service.

**Independent Test**: Against `SqliteOpsStore(':memory:')`, query checkout, payment,
authentication, a service without a runbook, and an unknown service; verify each result is
service-specific and empty when no matching runbook exists.

### Tests for User Story 3

- [X] T016 [US3] Extend `src/agents/tools.test.ts` with `consultar_runbooks` tests for checkout,
  payment, authentication, a seeded service without a runbook, and an unknown service using
  `SqliteOpsStore(':memory:')`

### Implementation for User Story 3

- [X] T017 [US3] Implement prepared-statement-backed `listRunbooks(service)` in
  `src/store/sqlite-ops-store.ts`, matching by bound service name and returning validated
  runbooks in deterministic order
- [X] T018 [US3] Add `consultar_runbooks` in `src/agents/tools.ts` with a non-empty Zod-described
  `service` input and a description specifying service-specific lookup and empty-result
  behavior
- [X] T019 [US3] Update `src/agents/tools.ts` and `src/agents/reasoning.ts` so both agent
  strategies expose the complete five-tool set and include `list_incidents` and
  `consultar_runbooks` in the action schema/trace tool-name union

**Checkpoint**: Runbook lookup is available to both agent strategies and does not leak guidance
between services.

---

## Phase 6: User Story 4 - Reproduce operational test scenarios (Priority: P2)

**Goal**: Keep deterministic process-local test and benchmark scenarios available alongside
SQLite persistence, while exercising tool behavior against isolated SQLite databases.

**Independent Test**: Run benchmark tests against independent mock stores and existing
`catalog-api` scenarios, and run the full tool suite against separate `:memory:` databases;
verify benchmark scenarios do not touch the configured persistent file.

### Tests for User Story 4

- [X] T020 [US4] Update `src/bench.test.ts` to assert benchmark scenarios retain independent
  deterministic stores and still cover `catalog-api` after the shared `OpsStore` contract is
  introduced
- [X] T021 [US4] Update `src/agents/tools.test.ts` setup and cleanup to use distinct
  `SqliteOpsStore(':memory:')` instances for every test and close each database after assertions

### Implementation for User Story 4

- [X] T022 [US4] Update `src/agents/store.ts` so `createOpsStore()` remains a deterministic
  process-local `OpsStore` implementation, retains `catalog-api` only as a benchmark fixture,
  provides all shared contract methods, and uses only `sev1 | sev2 | sev3` severity values
- [X] T023 [US4] Update `src/bench.ts`, `src/bench.test.ts`, and agent strategy test fixtures
  to use `sev1 | sev2 | sev3` consistently, preserving the C1 critical-alert outcome by
  mapping its expected alert to `sev1` and preserving C2/C3 `sev2` incident expectations
- [X] T024 [US4] Update `src/agents/store.test.ts` to verify the mock satisfies the shared
  `OpsStore` contract, retains its deterministic benchmark-only catalog fixture, and rejects
  unsupported severity values

**Checkpoint**: Mock-backed benchmarks remain repeatable and SQLite-backed tool tests remain
isolated from persistent application data.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Document configuration and verify the combined feature against repository gates.

- [X] T025 [P] Document `OPSPILOT_DB`, its default `./data/opspilot.db`, the `:memory:` test
  mode, and the benchmark mock in `README.md`
- [X] T026 Run `npm run test` and fix feature-related failures across
  `src/store/sqlite-ops-store.test.ts`, `src/agents/tools.test.ts`, `src/agents/store.test.ts`,
  and `src/bench.test.ts`
- [X] T027 Run `npm run typecheck` and fix feature-related type errors in
  `src/store/sqlite-ops-store.ts`, `src/agents/domain.ts`, `src/agents/tools.ts`,
  `src/agents/index.ts`, and `src/index.ts`
- [X] T028 Execute the feature validation steps in
  `specs/003-sqlite-operations-persistence/quickstart.md` and record any required corrections
  in the affected implementation or test files

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: Can start immediately.
- **Foundational (Phase 2)**: Depends on setup; blocks all user-story phases because both
  implementations use the shared domain types, contract, and persistent seed.
- **US1 (Phase 3)**: Depends on Phase 2; delivers durable schema, seed, core persistence, and
  production composition.
- **US2 (Phase 4)**: Depends on US1's SQLite incident lifecycle and Phase 2's shared
  `IncidentFilter`; adds filtered listing and tool descriptions.
- **US3 (Phase 5)**: Depends on US1's runbook table/seed and Phase 2's Runbook type; can proceed
  independently from US2 once US1 is complete.
- **US4 (Phase 6)**: Depends on Phase 2's contract and enum updates; integrate after US1–US3
  to preserve the complete mock and tool surface.
- **Polish (Phase 7)**: Depends on desired stories; full test and typecheck validation occurs
  after integration.

### User Story Dependencies

- **US1 (P1)**: Depends only on the foundational types/contract/seed. It is the MVP.
- **US2 (P1)**: Depends on US1's persistent incident lifecycle; can be implemented separately
  after US1.
- **US3 (P2)**: Depends on US1's runbook schema/seed, but not on US2.
- **US4 (P2)**: Depends on shared contracts; final integration should follow US1–US3.

### Parallel Opportunities

- T001 is independent of all domain and persistence work.
- After T002, T003 and T004 can be developed in parallel only if T004 imports the final
  exported domain types from T002 and does not require the unfinished interface in T003.
- Within US1, schema/reopen tests (T005) and lifecycle tests (T006) are in the same test file
  and should be written by one worker sequentially; implementation tasks T007–T010 depend on
  the schema and store from T007 and should proceed in listed order.
- After US1, US2 and US3 can be implemented in parallel because they modify separate tool test
  cases and use separate store methods; avoid editing `src/agents/tools.ts` concurrently.
- In US4, benchmark fixture changes (T020, T023) and store contract tests (T024) may be
  parallelized after shared types stabilize, but T021 must coordinate with US2/US3 changes to
  the same `src/agents/tools.test.ts`.
- Documentation T025 can run in parallel with implementation; final verification T026–T028
  follows all code changes.

## Parallel Example: User Story 1

```text
After T002–T004 are complete:
1. Write tests in src/store/sqlite-ops-store.test.ts for idempotent seed and file reopen (T005).
2. Extend that test file with durable incident lifecycle assertions (T006).
3. Implement schema and connection lifecycle in src/store/sqlite-ops-store.ts (T007).
4. Add transactional seed, prepared CRUD, and production injection in order (T008–T010).
```

## Parallel Example: User Stories 2 and 3

```text
After User Story 1 is complete:
US2: Add incident filter/tool tests in src/agents/tools.test.ts and CHECK tests in
     src/store/sqlite-ops-store.test.ts; then implement filtered queries and list_incidents.
US3: Add runbook-only tests in a separate test file or a coordinated section of tools.test.ts;
     then implement listRunbooks and consultar_runbooks.
Do not edit src/agents/tools.ts from two workers simultaneously.
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete setup and the foundational domain contract/seed.
2. Complete US1 tests before implementation.
3. Implement the persistent schema and idempotent seed, then core reads and incident lifecycle.
4. Inject the configured store in production composition.
5. Validate US1 independently with reopen/persistence tests and typecheck.

### Incremental Delivery

1. US1 delivers durable persisted operational state as the MVP.
2. US2 adds incident status filtering and complete incident tool guidance.
3. US3 adds service-specific runbook consultation.
4. US4 preserves deterministic mocks and benchmark reproducibility while tools use SQLite in
   isolated tests.
5. Run the full test, typecheck, and quickstart gates after integration.

## Notes

- Every task follows `- [ ] Tnnn [P?] [USn?] ...` and names at least one concrete file path.
- `[P]` is reserved for tasks that edit separate files and have no dependency on incomplete
  work; tests touching the same file are deliberately not marked parallel.
- `sev1 | sev2 | sev3` is the confirmed closed set for service tier and alert/incident severity.
- The existing project is a single TypeScript project; do not create a separate `tests/` tree.
