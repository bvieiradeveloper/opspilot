# Tasks: War Room Web Console

**Input**: Design documents from `specs/016-war-room-web/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`

**Tests**: Tests are included because the project constitution requires tests for every new behavior and the feature changes production operations.

**Organization**: Tasks are grouped by user story so stories can be implemented and verified as incremental releases.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: The task edits files independent of other incomplete tasks in the phase.
- **[Story]**: User-story tasks use `[US1]` through `[US4]`; setup, foundational, and polish tasks omit story labels.
- Every task names the exact file path(s) it changes.

## Phase 1: Setup

**Purpose**: Establish the separate browser workspace and build/typecheck entry points.

- [X] T001 Add the `web` npm workspace and scripts `web:dev`, `web:build`, and `web:typecheck` to `package.json`, keeping existing scripts unchanged.
- [X] T002 [P] Create the Vite config with `base: "/opspilot/"` in `web/vite.config.ts` and the browser TypeScript configuration in `web/tsconfig.json`.
- [X] T003 Add the React/Vite/Tailwind, Markdown/GFM/sanitizer, JSDOM, and Testing Library dependencies required by `specs/016-war-room-web/plan.md` to `package.json` and `package-lock.json`; verify no dependency is added to the server's runtime bundle unnecessarily.
- [X] T004 Create the HTML entry point and React mount entry in `web/index.html` and `web/src/main.tsx`, importing the Tailwind entry stylesheet from `web/src/styles.css`.
- [X] T005 Add a minimal `/opspilot/` production build smoke assertion in `web/src/base-path.test.ts` that checks generated asset URLs use the configured prefix.

**Checkpoint**: Root npm commands can invoke a separate Vite application and build its assets under `/opspilot/`.

## Phase 2: Foundational

**Purpose**: Establish shared, secure API configuration and browser CORS before story work.

- [X] T006 [P] Add configuration tests in `src/config.test.ts` proving `OPSPILOT_USER_ID` is required and non-empty for War Room mode, `OPSPILOT_WEB_ORIGINS` is parsed as exact origins, and missing values fail explicitly without reading `.env`.
- [X] T007 [P] Add CORS integration tests in `src/http/cors.test.ts` for an allowed origin, disallowed origin, and `OPTIONS` preflight permitting `POST`, `Content-Type`, and `Idempotency-Key` without enabling credentials.
- [X] T008 Implement typed environment configuration in `src/config.ts`; validate one non-empty installation `userId` and a list of absolute HTTP(S) frontend origins from `OPSPILOT_USER_ID` and `OPSPILOT_WEB_ORIGINS`, and never read `.env` from application code.
- [X] T009 Configure the Express CORS middleware in `src/http/server.ts` and `package.json` to allow only configured exact origins, handle required preflight headers/methods, expose `Retry-After`, and omit credentialed requests.
- [X] T010 Add deterministic constructors/injection points for the configured installation identity and allowed origins in `src/http/server.ts` so tests can cover configuration failures without exposing `.env` or process secrets.

**Checkpoint**: The server has an explicit, testable single-installation identity and narrow CORS behavior; the API is still required to be deployed behind a trusted network perimeter.

## Phase 3: User Story 1 - Converse with the on-call agent (Priority: P1) 🎯 MVP

**Goal**: Deliver a reliable chat interface that sends one message at a time, follows backend conversation IDs, safely renders Markdown, and can retry without duplicating a turn.

**Independent Test**: With a deterministic chat service, submit an initial message and follow-up; verify the first request omits `conversationId`, the server applies configured identity, the follow-up sends the returned ID, Markdown renders safely, and retrying an identical idempotency key does not repeat the turn or action.

### Tests for User Story 1

- [X] T011 [P] [US1] Add chat API tests in `src/http/server.test.ts` for first-turn ID creation, follow-up context, server-configured identity, compatibility with existing explicit-`userId` callers, and unchanged safe error responses.
- [X] T012 [P] [US1] Add SQLite idempotency-store tests in `src/store/sqlite-chat-idempotency-store.test.ts` for unique keys, request-fingerprint mismatch, duplicate claims, terminal response replay, in-progress claims, and 24-hour expiry.
- [X] T013 [P] [US1] Add chat retry integration tests in `src/http/chat-idempotency.test.ts` verifying same-key/same-payload replay, same-key/different-payload `409 IDEMPOTENCY_KEY_REUSED`, in-progress `409 REQUEST_IN_PROGRESS` with `Retry-After`, and no duplicate conversation append or tool execution.
- [X] T014 [P] [US1] Add API client tests in `web/src/services/chat-api.test.ts` for request payloads, optional first-turn conversation ID, response Zod validation, HTTP errors, malformed JSON, CORS/network failures, and retry-key reuse.
- [X] T015 [P] [US1] Add chat UI tests in `web/src/components/Chat.test.tsx` for empty state, one-time message display, loading/duplicate-submit prevention, retry, assistant Markdown tables/lists/emphasis/code, unsafe HTML/link handling, and responsive keyboard-operable controls.

### Implementation for User Story 1

- [X] T016 [US1] Define chat idempotency record schemas and store interface in `src/store/chat-idempotency-store.ts`; enforce key constraint "Required, bounded opaque value; unique within the installation", compare a stable fingerprint of normalized request content, and model status as `processing | completed`.
- [X] T017 [US1] Implement the SQLite idempotency store in `src/store/sqlite-chat-idempotency-store.ts`; persist `responseStatus`, `responseBody`, `createdAt`, `completedAt`, and `expiresAt`, retain records for 24 hours, atomically claim keys, and avoid re-executing records left processing after a crash.
- [X] T018 [US1] Extend `ChatAppOptions` and server construction in `src/http/server.ts` and `src/index.ts` to inject/close the idempotency store and use the validated configured identity for War Room requests while preserving legacy explicit-identity callers.
- [X] T019 [US1] Implement idempotency claim/replay in `src/http/server.ts`; require `Idempotency-Key` for War Room requests, replay the original terminal status/body for an identical key, return the specified safe 409 errors for active or mismatched keys, and persist the terminal response before sending it.
- [X] T020 [US1] Ensure failed and timed-out chat requests release or complete their idempotency record safely in `src/http/server.ts`; never start a second strategy for a claimed key and never silently convert processing failures into successful responses.
- [X] T021 [US1] Add the validated chat API client in `web/src/services/chat-api.ts`; send JSON to the configured build-time default API origin, omit the first `conversationId`, pass a stable per-message `Idempotency-Key`, validate 200/202-compatible chat responses with Zod, and surface network, CORS, HTTP, and parse failures explicitly.
- [X] T022 [US1] Define typed browser conversation/message state and response validation schemas in `web/src/models/chat.ts`; keep transcript data in memory only, track `sending | complete | failed | awaiting_approval`, and associate returned conversation IDs with the current conversation.
- [X] T023 [US1] Implement safe Markdown rendering in `web/src/components/AssistantMarkdown.tsx` using React Markdown, GFM tables, raw-HTML-disabled parsing, and sanitization; render code and ordinary answer text safely without `dangerouslySetInnerHTML`.
- [X] T024 [US1] Implement the chat form and conversation view in `web/src/components/Chat.tsx`, `web/src/components/MessageList.tsx`, and `web/src/app/App.tsx`; show empty/loading/error states, prevent concurrent sends, retain retryable failed text and key, and associate subsequent turns with the service-issued conversation ID.
- [X] T025 [US1] Add visible structural styling and loading/error/message states in `web/src/styles.css`; ensure narrow layouts do not create page-wide horizontal scrolling.
- [X] T026 [US1] Add or update root package scripts in `package.json` so the existing `npm test` command discovers server and web `node:test` suites without changing existing tests' behavior.

**Checkpoint**: A single-operator can submit a question and follow-up, see safe Markdown and explicit errors, and safely retry without duplicate turns.

## Phase 4: User Story 2 - Inspect the execution trace (Priority: P2)

**Goal**: Make each assistant response auditable through a keyboard-accessible trace panel that preserves typed event order and exposes tool parameters/results.

**Independent Test**: Render a deterministic mixed trace; open "Ver raciocínio", verify each event appears once in source order with the correct category, and inspect complete action arguments and observation values.

### Tests for User Story 2

- [X] T027 [P] [US2] Add trace rendering tests in `web/src/components/TracePanel.test.tsx` for `thought`, `action`, `observation`, `answer`, all other known event types, an empty trace, and an unknown event; assert source order and literal escaped payload rendering.
- [X] T028 [P] [US2] Add keyboard/a11y panel tests in `web/src/components/TracePanel.test.tsx` proving the opener labels the selected response, close/Escape returns focus to the opener, and the panel remains operable at narrow viewport layouts.

### Implementation for User Story 2

- [X] T029 [US2] Define the complete existing discriminated trace-event union and API Zod schemas in `web/src/models/trace.ts`; preserve event-specific fields and retain unknown future events as safe identifiable data.
- [X] T030 [US2] Implement typed trace event cards in `web/src/components/TraceEvent.tsx`; categorize `thought`, `action`, `observation`, and `answer` as thought/action/observation/response, label other variants, and display complete tool names, arguments, and observation values as escaped text or JSON.
- [X] T031 [US2] Implement the expandable responsive audit panel in `web/src/components/TracePanel.tsx` and wire a "Ver raciocínio" action to every assistant response in `web/src/components/MessageList.tsx`; preserve source ordering and selected-response association.
- [X] T032 [US2] Add focus handling, dialog semantics for the narrow-screen trace panel, visible event-category styling, and bounded local overflow for long JSON/code in `web/src/components/TracePanel.tsx` and `web/src/styles.css`.

**Checkpoint**: The operator can inspect any answer's complete typed trace without exposing trace values as executable content.

## Phase 5: User Story 3 - Review and decide on a proposed action (Priority: P2)

**Goal**: Gate incident mutations on a durable explicit human decision and show independent, safe status cards for every proposal.

**Independent Test**: Propose opening and resolving incidents; verify each returns `202` without changing state, rejection never mutates state, approval executes exactly once, a retry replays the prior decision, and execution failure is not presented as rejection or safely repeatable.

### Tests for User Story 3

- [X] T033 [P] [US3] Add SQLite approval-store tests in `src/store/sqlite-approval-store.test.ts` for each legal state transition, rejected-state no-op, atomic pending claim under duplicate decisions, terminal replay, conflicting decisions, and persisted fields.
- [X] T034 [P] [US3] Add approval service tests in `src/services/approval-service.test.ts` for both allowlisted incident tools, Zod argument validation, generated descriptions, identity/request/conversation linkage, execution only after approval, safe failure recording, and prevention of duplicate execution.
- [X] T035 [P] [US3] Add approval HTTP tests in `src/http/approvals.test.ts` for valid/invalid decisions, `200` confirmed result, `202 executing`, `404` unknown approval, `409` conflict, and safe `500` handling.
- [X] T036 [P] [US3] Add agent mutation-gate tests in `src/agents/approval-tools.test.ts` verifying `open_incident` and `resolve_incident` return proposals without mutation while read-only tools remain automatic in both ReAct and plan-and-execute strategies.
- [X] T037 [P] [US3] Add approval-card tests in `web/src/components/ApprovalCard.test.tsx` for every approval entry in a 202 response, pending controls, concurrent-submit disabling, confirmed decisions, retry after network/CORS failure, malformed 202 data, rejection, and execution failure.

### Implementation for User Story 3

- [X] T038 [US3] Define approval schemas and store interface in `src/store/approval-store.ts`; validate `id` as unique opaque identifier, `requestId`, `conversationId`, and server `userId` as non-empty strings, `tool` as `open_incident | resolve_incident`, arguments with the relevant tool Zod schema, and status as `pending | executing | executed | rejected | failed`.
- [X] T039 [US3] Implement the SQLite approval store in `src/store/sqlite-approval-store.ts`; persist `createdAt`, nullable `decidedAt`, nullable `completedAt`, nullable `result`, and nullable safe `errorCode`, and atomically transition only pending records to rejected or executing.
- [X] T040 [US3] Implement the approval domain service in `src/services/approval-service.ts`; derive a readable proposal description from validated tool arguments, execute allowlisted tools only after approval, store success/failure outcomes, return an existing outcome for repeated identical decisions, and never retry an executing/failed action.
- [X] T041 [US3] Add an opt-in approval-aware tool registry in `src/agents/approval-tools.ts`, `src/agents/tools.ts`, and `src/agents/index.ts`; select it only for War Room HTTP requests so incident tools persist proposals instead of mutating state, while MCP, CLI, and legacy HTTP callers retain the original registry and read-only tools remain automatic.
- [X] T042 [US3] Extend chat result and response validation in `src/services/chat-service.ts` and `src/http/server.ts` to return HTTP 202 with a non-empty `approvals` array whenever a mutating action is pending, while retaining the existing 200 response when no approval is needed.
- [X] T043 [US3] Add `POST /approvals/:approvalId` to `src/http/server.ts`; validate path and `{ decision: "approve" | "reject" }`, associate the operation with configured server identity, return confirmed/replayed outcomes and safe `404`/`409`/`500` errors, and expose `Retry-After` for an executing result.
- [X] T044 [US3] Implement the typed approval API client in `web/src/services/approval-api.ts`; validate proposal and decision responses with Zod and surface connection, CORS, malformed-response, and server failures without success-shaped fallbacks.
- [X] T045 [US3] Implement one independent approval card per pending proposal in `web/src/components/ApprovalCard.tsx` and integrate the cards with chat messages in `web/src/components/MessageList.tsx`; show tool, description, arguments, status, explicit approve/reject buttons, pending request feedback, retryable transport errors, and terminal execution failures.

**Checkpoint**: No incident mutation executes before explicit approval, and each card accurately reflects the durable service outcome.

## Phase 6: User Story 4 - Configure and use the console accessibly (Priority: P3)

**Goal**: Let the operator configure the API base URL and theme, and use the complete application through keyboard navigation across screen sizes.

**Independent Test**: Save and reload a valid API URL and theme, verify subsequent chat/approval requests use the saved origin, reject invalid URLs, and complete chat/settings/trace/approval flows with keyboard at wide and narrow widths in light and dark themes.

### Tests for User Story 4

- [X] T046 [P] [US4] Add settings validation/storage tests in `web/src/services/preferences.test.ts` for absolute HTTP(S) URL only, no credentials/query/fragment, normalized endpoint joining, persistence across reload, and rejection without silently replacing the saved setting.
- [X] T047 [P] [US4] Add settings modal and theme tests in `web/src/components/SettingsDialog.test.tsx` for gear access, field labels, cancel/save, Escape/focus return, unsaved chat preservation, system/light/dark preferences, and keyboard-only controls.
- [X] T048 [P] [US4] Add accessibility/layout tests in `web/src/app/App.test.tsx` for semantic landmarks, visible focus, status announcements without focus movement, narrow-width reflow, independent trace/approval controls, and both color themes.

### Implementation for User Story 4

- [X] T049 [US4] Implement validated API URL and theme preference schemas/storage in `web/src/services/preferences.ts`; persist only `apiBaseUrl` and `theme` (`system | light | dark`) and never persist transcripts, tool data, secrets, or authorization tokens.
- [X] T050 [US4] Update `web/src/services/chat-api.ts` and `web/src/services/approval-api.ts` to read the current validated API origin at request time, join endpoint paths safely, and reject unsupported schemes or invalid configuration before issuing a request.
- [X] T051 [US4] Implement a keyboard-accessible gear control and settings dialog in `web/src/components/SettingsDialog.tsx`; provide a labeled API URL field, save/cancel actions, focus trap, Escape dismissal, focus return, and preserve unsaved chat input when dismissed.
- [X] T052 [US4] Implement system/light/dark theme selection and persisted explicit override in `web/src/app/theme.ts` and `web/src/app/App.tsx`; update document theme attributes without a flash of the wrong selected theme.
- [X] T053 [US4] Complete responsive layout, color contrast, semantic landmarks, visible focus, and polite non-focus-stealing status announcements in `web/src/styles.css`, `web/src/app/App.tsx`, and `web/src/components/Chat.tsx`.

**Checkpoint**: The operator can configure the API and theme, then complete each primary workflow accessibly after reload and at narrow widths.

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify the integrated feature, document deployment requirements, and guard against unsafe deployment assumptions.

- [X] T054 [P] Update `README.md` with web workspace commands, `/opspilot/` static deployment, `OPSPILOT_USER_ID`, `OPSPILOT_WEB_ORIGINS`, and the requirement to restrict API access behind a trusted network perimeter; do not document or expose secrets.
- [X] T055 [P] Add deployment configuration validation tests in `src/config.test.ts` ensuring empty/malformed origins or an empty operator identity fail startup with explicit safe messages.
- [X] T056 Run the full validation commands from `specs/016-war-room-web/quickstart.md`; fix any regressions in the touched source/test files and confirm `npm test`, `npm run typecheck`, `npm run web:typecheck`, and `npm run web:build` all pass.
- [X] T057 Manually validate the complete built application at `/opspilot/` using `specs/016-war-room-web/quickstart.md`; record pass/fail for the chat retry, trace, approval/rejection, CORS, unsafe Markdown, reload, keyboard, and narrow-screen scenarios in `specs/016-war-room-web/quickstart.md`.

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; creates the browser workspace and toolchain.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories with shared server identity and CORS configuration.
- **User Story 1 (Phase 3)**: Depends on Setup and Foundational; delivers the MVP chat and safe retry path.
- **User Story 2 (Phase 4)**: Depends on Setup, Foundational, and US1 response/message types; can begin trace-specific tests/components in isolation but integrates after US1.
- **User Story 3 (Phase 5)**: Depends on Setup, Foundational, and US1 chat handling/idempotency; needs the response types and routing from US1.
- **User Story 4 (Phase 6)**: Depends on Setup, Foundational, and US1 API client; can run in parallel with US2/US3 once the API client exists.
- **Polish (Phase 7)**: Depends on every user story included in the release.

### User Story Dependencies

- **US1 (P1)**: No user-story dependencies; it is the MVP baseline.
- **US2 (P2)**: Depends on US1's assistant response and typed trace data to integrate, but can independently test the panel with fixtures.
- **US3 (P2)**: Depends on US1 chat request handling so a 202 can be surfaced and retried idempotently; it owns the durable approval gate.
- **US4 (P3)**: Depends on US1 API client so the dynamic API URL applies consistently to chat and approvals.
- **US2, US3, and US4**: Can be implemented in parallel after US1's shared message and API client types stabilize, using disjoint component/service files except where integration tasks explicitly edit shared files.

### Parallel Opportunities

- Setup: T002 can be done in parallel with T001; T003 follows T001 because it edits package manifests; T004 follows T002/T003; T005 follows a buildable web entry.
- Foundational: T006, T007, and T008 can proceed in parallel; T009 uses T007/T008; T010 follows T008/T009.
- US1: T011–T015 are independent test files. T016–T017 precede T018–T020; T021–T025 can proceed in parallel after the workspace exists, with T024 consuming T021–T023.
- US2: T027 and T028 share a test file and should be combined or done sequentially; T029 can proceed independently, then T030–T032 build on the typed model.
- US3: T033–T037 are separate tests and can run in parallel. T038 precedes T039/T040; T041 depends on T040; T042–T043 depend on the service and tool gate; T044 can be developed independently; T045 integrates T044 and the chat view.
- US4: T046–T048 are separate tests and can proceed in parallel. T049 precedes T050; T051–T053 integrate on the API preferences.
- Polish: T054 and T055 can proceed independently; T056 and T057 run after all intended feature work is complete.

## Parallel Examples

### User Story 1

```text
Run independently:
- T011: API chat compatibility/identity tests in src/http/server.test.ts
- T012: SQLite idempotency tests in src/store/sqlite-chat-idempotency-store.test.ts
- T013: Idempotent HTTP behavior tests in src/http/chat-idempotency.test.ts
- T014: Browser API client tests in web/src/services/chat-api.test.ts
- T015: Chat UI tests in web/src/components/Chat.test.tsx
```

### User Story 2

```text
Run independently:
- T029: Trace Zod/type model in web/src/models/trace.ts
- After T029, implement T030 event rendering and T031 panel wiring in separate files.
```

### User Story 3

```text
Run independently:
- T033: Approval persistence tests in src/store/sqlite-approval-store.test.ts
- T034: Approval service tests in src/services/approval-service.test.ts
- T035: Approval endpoint tests in src/http/approvals.test.ts
- T036: Agent mutation-gate tests in src/agents/approval-tools.test.ts
- T037: Approval-card tests in web/src/components/ApprovalCard.test.tsx
```

### User Story 4

```text
Run independently:
- T046: Preference validation/storage tests in web/src/services/preferences.test.ts
- T047: Settings dialog tests in web/src/components/SettingsDialog.test.tsx
- T048: Accessibility/layout tests in web/src/app/App.test.tsx
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup and Foundational phases.
2. Implement and validate US1 chat, installation identity, server CORS, idempotent retry, and safe Markdown.
3. **Stop and validate**: run the US1 test files, strict typechecks, and production build. Verify no retry creates a duplicate turn/action.
4. Do not expose production incident mutations as unapproved operations; complete US3 before enabling mutation tools in a production deployment.

### Incremental Delivery

1. Deliver US1 as the usable read/investigation chat increment.
2. Add US2 trace audit independently against the stable response contract.
3. Add US3 approval persistence, endpoint, and cards; enable incident mutations only once the human-approval gate is complete.
4. Add US4 configurable API origin, theme, modal settings, and accessibility refinements.
5. Complete Polish and run all quickstart validations.
