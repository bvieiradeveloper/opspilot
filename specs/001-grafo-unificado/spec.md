# Feature Specification: Grafo Unificado

**Feature Branch**: `001-grafo-unificado`

**Created**: 2026-11-05

**Status**: Draft

**Input**: User description: "Grafo unificado: production graph with context, router, three strategy nodes, and response; structured routing with route and reason; route trace event and node field in every trace event; optional strategy override in chat."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Strategy Selection (Priority: P1)

A user sends an operational request through chat without choosing a strategy. The system evaluates the request and available strategy table, selects the most suitable strategy, records the routing decision, executes it, and returns the answer.

**Why this priority**: Automatic routing is the primary user experience and removes the need for clients to know internal strategy details.

**Independent Test**: Send requests representing each strategy category and verify that the response trace includes one routing decision and a selected strategy.

**Acceptance Scenarios**:

1. **Given** a valid chat request without a strategy override, **When** the request is processed, **Then** the system selects one supported strategy and returns an answer.
2. **Given** an operational request that requires iterative tool use, **When** routing is performed, **Then** the routed strategy is appropriate for the request and the routing reason is available in the trace.
3. **Given** a routing decision has been made, **When** execution events are recorded, **Then** every trace event identifies the executing node.

---

### User Story 2 - Explicit Strategy Override (Priority: P2)

A client sends a chat request with a strategy value. The chosen strategy takes precedence over automatic selection and is clearly represented in the routing trace.

**Why this priority**: Overrides support debugging, benchmarks, reproducibility, and clients that require deterministic strategy selection.

**Independent Test**: Send the same request with and without an override and verify that the override controls which strategy executes while routing information remains observable in the trace.

**Acceptance Scenarios**:

1. **Given** a valid supported strategy override, **When** chat is processed, **Then** the override strategy executes instead of automatic selection.
2. **Given** an unsupported strategy override, **When** chat is processed, **Then** the request is rejected with an actionable client error and no execution trace is returned.
3. **Given** an override is applied, **When** trace events are generated, **Then** the route event records the override behavior and each event has a node identifier.

---

### User Story 3 - Unified Execution Trace (Priority: P3)

Operators inspect a chat response and follow one continuous execution flow from context preparation through routing, strategy execution, and final response.

**Why this priority**: A consistent trace makes behavior understandable, supports incident diagnosis, and enables reliable comparisons between strategies.

**Independent Test**: Run one request through the unified flow and verify the stage order and node attribution for context, routing, strategy, and response stages.

**Acceptance Scenarios**:

1. **Given** a successfully processed chat request, **When** the response trace is inspected, **Then** it contains a routing event and final response information.
2. **Given** execution produced context, routing, strategy, or answer events, **When** trace events are inspected, **Then** every event carries a node identifier.
3. **Given** context preparation completes, **When** the next stage begins, **Then** routing receives the prepared context and conversation state consistently.

---

### Edge Cases

- If routing cannot return a valid selection, the system must use the documented default strategy or reject the request with a clear processing error, never infer a strategy outside the supported set.
- If a requested strategy override is unknown, the chat request must return a client error without starting strategy execution.
- If context preparation fails or yields invalid data, execution stops before routing and returns a general processing error.
- If the final answer stage fails, the trace must preserve completed prior events and report the failure without exposing implementation secrets.
- If conversation history or memory data is unavailable, context preparation proceeds only with available trusted inputs and does not misidentify missing data as successful retrieval.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide one production execution flow containing context preparation, routing, the supported strategies, and final response stages.
- **FR-002**: The context stage MUST prepare the request, conversation history, summary, and relevant memories for subsequent routing and strategy execution.
- **FR-003**: The router MUST select exactly one supported strategy for each request that proceeds past context preparation.
- **FR-004**: The routing result MUST include both the selected route and a concise reason describing the selection.
- **FR-005**: The router prompt MUST present a complete table of supported strategies and the type of request for which each is appropriate.
- **FR-006**: The execution MUST emit a trace event for the routing decision.
- **FR-007**: Every execution trace event MUST include a node identifier identifying the graph stage that produced it.
- **FR-008**: The chat request MUST accept an optional strategy override.
- **FR-009**: When a valid strategy override is present, it MUST take precedence over automatic routing for strategy execution and MUST be represented in trace output.
- **FR-010**: When no strategy override is present, the router MUST determine the strategy automatically.
- **FR-011**: Unsupported strategy overrides MUST be rejected before strategy execution with an actionable validation error.
- **FR-012**: Each of the three supported strategies MUST be represented as a distinct execution stage reachable from the router.
- **FR-013**: The final response stage MUST return the answer together with the unified execution trace and existing operational metrics.
- **FR-014**: Trace node identifiers MUST remain consistent across the context, router, strategy, and response stages for the lifetime of a request.
- **FR-015**: Existing chat behavior without strategy overrides MUST remain supported, with automatic routing added as the default decision path.

### Key Entities *(include if feature involves data)*

- **Chat Request**: A user message with optional conversation context, user identity, and optional strategy override.
- **Prepared Context**: The bounded information assembled for routing and strategy execution, including request, history, summary, and memories.
- **Routing Decision**: The selected strategy route and the reason supplied for that selection.
- **Strategy Stage**: One of the three supported execution approaches, responsible for producing an answer and trace events.
- **Trace Event**: A single observable event associated with a graph node and linked to the request execution.
- **Chat Response**: The final answer, unified trace, and operational metrics returned to the client.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100 percent of valid chat requests processed without an override produce a routing decision and a valid selected strategy.
- **SC-002**: 100 percent of trace events from successful or partially successful executions include a non-empty node identifier.
- **SC-003**: In validation tests, 100 percent of unsupported strategy overrides are rejected before a strategy runs.
- **SC-004**: At least one successful end-to-end scenario is verified for each of the three supported strategies.
- **SC-005**: At least 95 percent of routing decisions in the acceptance test set match the expected strategy category for representative requests.
- **SC-006**: Existing chat tests continue to pass, while new graph and trace tests cover automatic routing and overrides.

## Assumptions

- The three supported strategies are the strategies already exposed by the application: reactive execution, plan-and-execute, and reflection-enhanced execution.
- A routing table will use the existing strategy names and list when each is appropriate; an unsupported value will remain a client-side validation failure.
- Automatic routing defaults to the documented general-purpose strategy when the routing decision does not strongly match a specialized request.
- Existing conversation, memory, metrics, timeout, and response-error behavior remains in scope and is preserved unless explicitly changed.
- Tests use deterministic representative requests or controlled routing decisions so automated validation is not dependent on live model variability.
