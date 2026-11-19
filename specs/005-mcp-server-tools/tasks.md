# Tasks: OpsPilot MCP Server Tools

**Input**: Design documents from `/specs/005-mcp-server-tools/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Integration tests are required by FR-009 and the project constitution. They use Node's built-in test runner and an MCP client connected to a real child process over stdio.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other marked tasks (different files, no unfinished dependencies)
- **[Story]**: User story phase label mapped to `spec.md`
- Every task description includes the files to create or update.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install the MCP SDK and provide the documented server launch command.

- [x] T001 [P] Add `@modelcontextprotocol/sdk` as a production dependency and add the `mcp` script to `package.json` and `package-lock.json`; launch with `node --env-file-if-exists=.env --import tsx src/mcp/server.ts` so optional environment configuration is loaded before startup.
- [x] T002 [P] Extract the `list_alerts`, `open_incident`, and `resolve_incident` Zod inputs into exported named schemas in `src/agents/tools.ts`, preserving these constraints verbatim: list status enum `firing | resolved | all` default `firing`; incident title and service trimmed non-empty strings; severity enum `sev1 | sev2 | sev3`; resolve id trimmed non-empty string. Refactor the existing LangChain tools to use those same schema objects.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Provide a reusable real-process MCP client harness for the required integration tests.

- [x] T003 Create `src/mcp/test-utils.ts` to launch `src/mcp/server.ts` with `process.execPath` and `--import tsx`, set `OPSPILOT_DB` to a temporary SQLite file, connect an SDK `Client` using `StdioClientTransport`, expose the client/database path for assertions, capture stdout/stderr, and close the client, process, and temporary resources in cleanup.

**Checkpoint**: Package, shared input schemas, and process-level test harness are ready before story implementation.

---

## Phase 3: User Story 1 - Discover and inspect operational tools (Priority: P1) 🎯 MVP

**Goal**: Let an MCP client connect to the `opspilot` server and discover the exact three operational tools without protocol pollution.

**Independent Test**: Launch the server in a child process, connect over stdio, verify server name `opspilot`, verify the exact names `list_alerts`, `open_incident`, and `resolve_incident`, and confirm stdout contains only parseable MCP protocol traffic.

### Tests for User Story 1

- [x] T004 [US1] Add a subprocess integration test in `src/mcp/server.test.ts` that connects with the helper in `src/mcp/test-utils.ts`, checks the server identity and exact tool list, and fails if startup diagnostics or non-protocol output appear on stdout.

### Implementation for User Story 1

- [x] T005 [US1] Implement `src/mcp/server.ts` with server identity `opspilot`, stdio transport, and exactly three registered tools; build one configured `OpsStore` with `createConfiguredSqliteOpsStore`, reuse the named shared schemas from `src/agents/tools.ts` and the existing operation handlers from `createOpsTools(store)`, write any diagnostics only to stderr, and close the store during server shutdown.

**Checkpoint**: Discovery identifies the correct server and all three usable tool contracts through a clean stdio session.

---

## Phase 4: User Story 2 - Review current alerts (Priority: P1)

**Goal**: Return the configured store's alerts through `list_alerts` with the same default, filters, and result shape as the existing operation.

**Independent Test**: Invoke `list_alerts` through an MCP client and confirm the default returns firing alerts and explicit status filters match the corresponding records in the same configured SQLite store.

### Tests for User Story 2

- [x] T006 [P] [US2] Add `src/mcp/alerts.test.ts` using `src/mcp/test-utils.ts` to call `list_alerts` with omitted status and with `resolved` and `all`, parse the text result as JSON, and compare the returned records and counts with a second `SqliteOpsStore` opened on the test database.

**Checkpoint**: Alert results through MCP match the existing store and input defaults.

---

## Phase 5: User Story 3 - Open or resolve an incident (Priority: P2)

**Goal**: Allow the MCP client to create and resolve incidents in the same authoritative operational store and receive explicit failures for invalid operations.

**Independent Test**: Open an incident through MCP, resolve the returned incident identifier, and verify both transitions in the same test database; verify invalid requests return tool errors and do not create successful-looking results.

### Tests for User Story 3

- [x] T007 [P] [US3] Add `src/mcp/incidents.test.ts` using `src/mcp/test-utils.ts` to open a valid incident, resolve its returned id, assert the returned statuses and matching persisted state through `SqliteOpsStore`, and verify an unknown id and an invalid service return MCP errors.

**Checkpoint**: MCP incident operations follow existing validation and domain rules without diverging state.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the feature end-to-end and keep its validation guide accurate.

- [x] T008 Run `node --import tsx --test src/mcp/server.test.ts src/mcp/alerts.test.ts src/mcp/incidents.test.ts`, `npm run typecheck`, and `npm test`; fix failures in the relevant `src/mcp/`, `src/agents/tools.ts`, or package files, and align the runnable commands in `specs/005-mcp-server-tools/quickstart.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; T001 and T002 can run in parallel because they modify different files.
- **Foundational (Phase 2)**: T003 depends on T001 for the SDK client and server transport packages; it blocks all integration tests.
- **User Stories (Phase 3+)**: Depend on Phase 1 and Phase 2.
- **Polish (Phase 6)**: T008 depends on completion of all three user-story phases.

### User Story Dependencies

- **User Story 1 (P1)**: First independently testable server slice after setup/foundation; no dependency on other user stories.
- **User Story 2 (P1)**: Depends on the server and shared schemas from US1; can be tested independently with the subprocess harness.
- **User Story 3 (P2)**: Depends on the server and shared schemas from US1; can be tested independently with the subprocess harness and is parallelizable with US2 after US1 is complete.

### Within Each User Story

- Write the story's integration test before implementing or adjusting the behavior it verifies.
- Keep tool input schemas shared; do not create separate MCP-only definitions.
- Route data access and incident transitions through the existing `OpsStore` operations.
- Complete each story's independent test before proceeding to the next priority.

### Parallel Opportunities

- T001 and T002 can run concurrently because they change `package.json`/`package-lock.json` and `src/agents/tools.ts` respectively.
- After T005 completes, T006 and T007 can run concurrently because they use separate test files and separate temporary SQLite databases.
- No story test is parallelized with its prerequisite server implementation or test harness.

## Parallel Example: User Stories 2 and 3

```text
After T005 is complete:
Task T006: Add the alert-listing MCP integration test in src/mcp/alerts.test.ts
Task T007: Add the incident lifecycle MCP integration test in src/mcp/incidents.test.ts
```

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001-T003 to prepare the SDK dependency, shared schemas, and process-level test harness.
2. Complete T004-T005 to implement and validate server identity, stdio transport, and exact tool discovery.
3. Stop and validate the P1 discovery slice using `src/mcp/server.test.ts`.

### Incremental Delivery

1. Complete Setup and Foundational phases.
2. Deliver US1 and validate discovery plus stdout protocol purity.
3. Deliver US2 and validate alert results and filters against the configured store.
4. Deliver US3 and validate incident creation, resolution, persistence, and failure behavior.
5. Run the complete test suite and typecheck, then confirm the quickstart instructions.
