# Feature Specification: Persisted Request Tracing

**Feature Branch**: `[014-persisted-request-tracing]`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Trace persistido + logs JSON:
- /chat: requestId no corpo e no header X-Request-id.
- SQLite: requests (métricas) e trace_events (node, payloads).
- src/obs/logger.ts: 1 linha JSON por evento, só metadados.
- GET /request/:id registro + trace ordenado"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Correlate a chat request (Priority: P1)

As an API caller, I need a stable request identifier in both the chat response and its header so that I can correlate the result with logs and later inspect its execution.

**Why this priority**: Without a shared identifier, callers cannot reliably find the operational record for a chat request.

**Independent Test**: Submit an accepted chat request and verify that the response body and `X-Request-id` header contain the same non-empty identifier.

**Acceptance Scenarios**:

1. **Given** an accepted chat request, **When** it completes, **Then** the response body and `X-Request-id` header contain the same request identifier.
2. **Given** two separate accepted chat requests, **When** both complete, **Then** each has a distinct identifier and independently retrievable request history.

### User Story 2 - Inspect a request and its trace (Priority: P1)

As an on-call operator, I need to retrieve a request's recorded metrics and ordered execution trace so that I can understand what happened during a chat request.

**Why this priority**: A durable, ordered record lets operators investigate prior requests after their original response has passed.

**Independent Test**: Complete a chat request with a known sequence of trace events, retrieve it by its identifier, and verify its request metrics and trace event order.

**Acceptance Scenarios**:

1. **Given** a completed chat request with metrics and multiple trace events, **When** an operator requests `GET /request/:id`, **Then** the response contains the matching request record and all trace events in their original order.
2. **Given** a recorded request with no trace events, **When** it is retrieved, **Then** its request record is returned with an empty trace.
3. **Given** an identifier that has no recorded request, **When** it is retrieved, **Then** the endpoint returns a not-found response and does not return another request's data.

### User Story 3 - Review operational logs without exposing event content (Priority: P2)

As an operator reviewing service logs, I need each event represented as one machine-readable JSON line containing metadata only so that I can filter and correlate activity without copying request or trace payload contents into logs.

**Why this priority**: Consistent, content-free log records aid troubleshooting while limiting unnecessary exposure of operational data.

**Independent Test**: Emit representative events with metadata and content-bearing payloads, then verify every emitted event is one valid JSON line with metadata and without payload or message content.

**Acceptance Scenarios**:

1. **Given** an event with request metadata, **When** it is logged, **Then** exactly one valid JSON line is emitted for that event.
2. **Given** an event that includes a request or trace payload, **When** it is logged, **Then** the log line contains metadata only and excludes the payload contents.

### Edge Cases

- A request fails after receiving an identifier; the identifier remains consistent across its response metadata and any available request record.
- A request has no trace events; retrieval returns an empty trace rather than failing.
- Several trace events occur during the same request; retrieval preserves their occurrence order.
- A request identifier is unknown; retrieval returns not found without exposing unrelated records.
- A metadata field is absent; the event remains valid JSON and does not require inventing a value.
- A logged payload contains sensitive content; that content is not included in the log line.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST assign a unique request identifier to each accepted `POST /chat` request.
- **FR-002**: The chat response MUST include the assigned identifier as `requestId` in its body and in the `X-Request-id` response header, with identical values.
- **FR-003**: The system MUST use SQLite to persist each accepted request's user identifier, selected route when known, outcome, and available metrics (including model, prompt-token count, and latency) in the `requests` table, and the record MUST remain retrievable after a service restart.
- **FR-004**: The system MUST persist each request's trace events in the `trace_events` table, including the available node and payload information and their occurrence order.
- **FR-005**: The system MUST expose `GET /request/:id` to return the matching request record and its trace events in occurrence order.
- **FR-006**: When no request record exists for the supplied identifier, the retrieval endpoint MUST return a not-found response and MUST NOT return data from another request.
- **FR-007**: A request with no trace events MUST be retrievable with an empty trace.
- **FR-008**: The logger MUST emit exactly one valid JSON line for each event it logs.
- **FR-009**: Log lines MUST contain event metadata only and MUST NOT include request or trace payload contents.
- **FR-010**: Request identifiers MUST be consistent across the chat response, persisted record, trace events, and corresponding log metadata wherever those records are available.

### Key Entities *(include if feature involves data)*

- **Request Record**: A chat request identified by a unique request identifier, associated with its user identifier and selected route when known, and containing its outcome and available metrics.
- **Trace Event**: An ordered event associated with one request, identifying the node and its available payload.
- **Log Event**: A machine-readable event record containing metadata used to correlate and filter activity without event payload contents.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of accepted chat requests in contract tests return the same non-empty request identifier in the response body and response header.
- **SC-002**: 100% of recorded requests in persistence tests remain retrievable after a service restart with matching metrics and trace events in their original order.
- **SC-003**: 100% of unknown identifiers in retrieval tests return not found and expose no other request's record or trace.
- **SC-004**: Every tested logged event produces exactly one parseable JSON line, and none of those lines contains the tested request or trace payload contents.
- **SC-005**: In all operator lookup scenarios, operators can locate the corresponding request and review its ordered trace using only the identifier returned by chat.

## Assumptions

- The system creates request identifiers; callers do not select or override them.
- Request records include metrics available at completion, and trace events include the node and payload data already produced by the chat execution.
- SQLite persistence uses a `requests` record for request outcomes and metrics and `trace_events` records for node and payload data, as explicitly requested.
- Logs intentionally omit request and trace payloads even when those payloads are retained in the request trace.
- Existing application data-retention behavior applies; this feature does not introduce a separate retention policy.
- Invalid chat bodies rejected before a request is accepted are outside the request-record lifecycle defined here.
