# Feature Specification: Chat API

**Feature Branch**: `[002-chat-api]`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "POST /chat em src/http/server.ts (ou padrão do express): body { message, strategy?, reflect?) validado com zod; default react. 200 { answer, trace, metrics }; 400 body inválido (issues do zod); 422 estratégia desconhecida; timeout 180s -> 504. Registry em src/agents/index.ts (nome -> estratégia; reflectaplica withReflection). Teste de integração com estratégia fake determinística, sem rede"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Submit a chat request (Priority: P1)

A caller submits a message and receives the agent's answer together with its trace and metrics.

**Why this priority**: Returning a complete, usable result is the primary purpose of the chat endpoint.

**Independent Test**: Submit a valid message using a deterministic strategy and verify the successful response contains an answer, trace, and metrics without contacting a model provider or other external service.

**Acceptance Scenarios**:

1. **Given** a valid message and no strategy, **When** the caller submits the request, **Then** the default `react` strategy is used and a successful response contains `answer`, `trace`, and `metrics`.
2. **Given** a valid message and a supported strategy, **When** the caller submits the request, **Then** the selected strategy processes it and the successful response contains `answer`, `trace`, and `metrics`.

### User Story 2 - Request reflective reasoning (Priority: P2)

A caller can request reflection while choosing a supported reasoning strategy.

**Why this priority**: Reflection is an optional capability; the core chat flow remains useful without it.

**Independent Test**: Submit the same valid request with reflection disabled and enabled, using a deterministic strategy, and verify that the requested mode is honored while both responses preserve the common response shape.

**Acceptance Scenarios**:

1. **Given** a valid request with reflection enabled, **When** the caller submits it, **Then** the selected strategy is processed with reflection applied.
2. **Given** a valid request with reflection omitted, **When** the caller submits it, **Then** reflection is not applied.

### User Story 3 - Receive actionable request errors (Priority: P2)

A caller receives a clear status and validation details when a request cannot be processed.

**Why this priority**: Explicit failures let callers distinguish invalid input, unsupported choices, and requests that exceed the processing limit.

**Independent Test**: Submit malformed input, an unknown strategy, and a strategy that exceeds the time limit; verify each produces its specified status without making an external network call in the integration test.

**Acceptance Scenarios**:

1. **Given** a body that does not satisfy the request contract, **When** submitted, **Then** the caller receives status `400` with validation issues.
2. **Given** a strategy name that is not supported, **When** submitted, **Then** the caller receives status `422`.
3. **Given** a request that has not completed within 180 seconds, **When** its processing limit is reached, **Then** the caller receives status `504`.

### Edge Cases

- A missing or non-string `message` is rejected as an invalid body.
- An omitted `strategy` uses `react`; a supplied unsupported strategy is not silently replaced.
- An omitted `reflect` value follows the non-reflective default; a supplied value must satisfy the request contract.
- A strategy that remains incomplete at the 180-second limit produces a timeout response.
- Successful responses always include all three fields: `answer`, `trace`, and `metrics`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The chat endpoint MUST accept `POST /chat` with a required string `message`, an optional string `strategy`, and an optional boolean `reflect`.
- **FR-002**: The endpoint MUST validate the request body and reject values that do not satisfy the request contract.
- **FR-003**: When `strategy` is omitted, the endpoint MUST use `react`.
- **FR-004**: The endpoint MUST select a supported strategy by its registered name and MUST return status `422` when the requested strategy is unknown.
- **FR-005**: When reflection is requested, the endpoint MUST apply reflection to the selected strategy; when omitted, reflection MUST remain disabled.
- **FR-006**: For a successfully processed request, the endpoint MUST return status `200` and an `answer`, `trace`, and `metrics`.
- **FR-007**: For an invalid request body, the endpoint MUST return status `400` and include the validation issues.
- **FR-008**: The endpoint MUST stop waiting for a request after 180 seconds and return status `504`.
- **FR-009**: Integration coverage MUST exercise the endpoint with a deterministic strategy that does not require external network access.

### Key Entities *(include if feature involves data)*

- **Chat Request**: A caller's message and optional strategy selection and reflection preference.
- **Chat Result**: The answer produced for a request, with its execution trace and metrics.
- **Reasoning Strategy**: A named, supported way to process a chat request, optionally with reflection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of valid requests in the contract test cases receive status `200` and include `answer`, `trace`, and `metrics`.
- **SC-002**: 100% of requests without a strategy use `react` in the contract test cases.
- **SC-003**: 100% of invalid bodies and unknown strategies in the contract test cases receive their specified statuses (`400` and `422`) and invalid bodies include validation issues.
- **SC-004**: Requests exceeding the 180-second processing limit receive status `504`.
- **SC-005**: The endpoint's integration scenarios complete with a deterministic strategy and no external service access.

## Assumptions

- The endpoint is available to callers without adding a new authentication or authorization flow.
- `message` must be a non-empty string; omitted `reflect` means reflection is disabled.
- Supported strategy names are the names registered by the application; no new strategy is introduced by this feature.
- The 180-second limit applies to each individual chat request.
- Existing trace and metrics data can be returned as produced by the selected strategy.