# Tasks: External Provider Status

**Input**: Design documents from `specs/004-provider-status/`

**Prerequisites**: plan.md and spec.md; supporting artifacts include research.md, data-model.md,
contracts/provider-status-tool.md, and quickstart.md.

**Tests**: Included because the feature specification explicitly requires fake-fetch tests and the
project constitution requires test-first changes.

**Organization**: Tasks are grouped by user story so each increment can be verified independently.

## Phase 1: Setup

**Purpose**: Project initialization and basic structure.

No setup changes are required; the existing TypeScript project and agent-tools test structure are
already in place.

## Phase 2: Foundational

**Purpose**: Blocking prerequisites shared by all user stories.

No additional foundational tasks are required. The current agent tool factory, Zod dependency,
Fetch API, and test runner provide the required foundation.

## Phase 3: User Story 1 - Distinguish provider outages from internal incidents (Priority: P1)

**Goal**: Allow the agent to check GitHub or Cloudflare status, defaulting to GitHub, and return a
compact status observation.

**Independent Test**: Invoke the tool with a fake valid response for both providers and with no
provider argument; verify endpoint selection, default behavior, one-line result, and the tool
description.

### Tests for User Story 1

- [X] T001 [US1] Add fake-fetch tests for GitHub default selection, Cloudflare selection, endpoint URLs, compact successful status output, and usage-oriented tool description in `src/agents/tools.test.ts`

### Implementation for User Story 1

- [X] T002 [US1] Add `check_provider_status` to the returned tools and exported tool bindings, with provider enum `github | cloudflare`, default `github`, explanatory parameter description, matching public status URLs, injectable fetch, Zod validation of `{ status: { indicator, description } }`, and one-line success output in `src/agents/tools.ts`

**Checkpoint**: User Story 1 is functional and testable with fake responses, without network access.

## Phase 4: User Story 2 - Receive a useful observation when status cannot be retrieved (Priority: P2)

**Goal**: Bound status lookups with a five-second timeout and one retry for timeout, network, or
HTTP 5xx failures; return readable final failures as observations.

**Independent Test**: With fake fetch implementations, simulate timeout/network/5xx outcomes and
invalid payloads; verify retry eligibility, at most two requests, and readable non-throwing final
results.

### Tests for User Story 2

- [X] T003 [US2] Add fake-fetch tests for per-attempt five-second timeout signals, retry once after timeout/network/HTTP 5xx, success after retry, final readable failure without throw, invalid response without retry, and non-5xx HTTP error without retry in `src/agents/tools.test.ts`

### Implementation for User Story 2

- [X] T004 [US2] Implement five-second `AbortSignal.timeout` requests, exactly one retry after timeout/network/HTTP 5xx, no retries for invalid payload or other HTTP errors, and readable one-line final error observations that do not escape as exceptions in `src/agents/tools.ts`

**Checkpoint**: Both user stories work independently with fake fetch and no live provider dependency.

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Verify the finished feature against the design and repository quality gates.

- [X] T005 Run provider-status tool tests and `npm run typecheck`, then update `specs/004-provider-status/quickstart.md` if the runnable validation commands or expected outcomes need correction

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No implementation changes required; the current project structure is ready.
- **Foundational (Phase 2)**: No additional work required; existing dependencies and tool/test
  infrastructure are sufficient.
- **User Stories (Phase 3+)**: Begin after setup and foundation are confirmed.
- **Polish (Phase 5)**: Depends on both user stories being implemented.

### User Story Dependencies

- **User Story 1 (P1)**: No dependency on another story; provides the successful status check.
- **User Story 2 (P2)**: Extends the same status-fetch path introduced by US1; implement after US1
  so retry and final-failure behavior reuse its provider selection and response validation.

### Within Each User Story

- Write the fake-fetch tests first and confirm they fail before implementation.
- Keep provider selection and success behavior in place before adding resilient failure handling.
- Re-run the focused tests after each implementation increment.

### Parallel Opportunities

- No story tasks are marked `[P]`: both stories modify `src/agents/tools.ts` and
  `src/agents/tools.test.ts`, so parallel edits would conflict.
- Documentation review in T005 follows implementation and is not parallel with code changes.

## Parallel Example: User Story 1

The user-story test and implementation tasks touch the same feature behavior and files; execute
T001 before T002 rather than in parallel.

## Parallel Example: User Story 2

The resilience test and implementation tasks share files and behavior; execute T003 before T004
rather than in parallel.

## Implementation Strategy

1. Deliver the P1 successful provider-status lookup as the MVP (T001-T002).
2. Add the P2 timeout, retry, and failure-observation behavior (T003-T004).
3. Run the focused tests and typecheck and confirm the quickstart guide remains accurate (T005).

The user-facing MVP is User Story 1; complete User Story 2 before considering the specified
feature fully implemented.
