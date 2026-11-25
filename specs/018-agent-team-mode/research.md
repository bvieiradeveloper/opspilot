# Research: Agent Team Mode

## Existing Project Findings

- Chat requests use `POST /chat`; `strategy` selects an explicit strategy and the current chat client sends an idempotency key.
- The production graph already dispatches explicit strategies and records a route trace. Automatic strategy selection is separate and can remain unchanged for this feature.
- Request traces are validated at the HTTP boundary and persisted by the existing request-tracing service. The web trace model accepts known event types and retains unknown types, while the trace panel renders events in order.
- The War Room strategy factory wraps incident mutations as approval proposals. The legacy strategy registry exposes ordinary operational tools, so team execution must not be allowed to fall back to that registry for incident mutations.
- The repository uses Zod, LangGraph, Node's built-in test runner through `tsx`, and colocated unit tests. No additional package is needed.

## Decisions

### Decision: Add team mode as an explicit `/chat` strategy

**Rationale**: The API already supports strategy selection and the graph already handles explicit overrides. Reusing the request avoids a parallel endpoint and preserves the existing response, idempotency, and trace lifecycle. Team mode will not be added to automatic route selection.

**Alternatives considered**:

- Add a separate `/team` endpoint: rejected because it duplicates chat request handling and trace/approval integration.
- Allow the automatic router to select team mode: rejected because team execution is a distinct operator choice and the request explicitly names a team route.

### Decision: Keep the blackboard transient and emit handoffs into the existing trace

**Rationale**: The shared state exists only to coordinate one run. The existing trace store already persists completed response events and the UI already exposes them in `Ver raciocínio`.

**Alternatives considered**:

- Persist the blackboard as a new database entity: rejected because the specification requires shared in-run context and trace visibility, not durable team state.
- Render a separate team timeline: rejected because an existing trace panel is the established location for reasoning events.

### Decision: Enforce role capabilities by construction and reuse the approval-aware executor path

**Rationale**: Analyst and planner must not receive operational mutation tools. The executor must not bypass existing approval checks. Team mode on an unprotected legacy chat path must fail explicitly instead of using direct mutation tools.

**Alternatives considered**:

- Give every role all tools and rely on role instructions: rejected because instructions alone do not enforce permissions.
- Reuse ordinary legacy tools for executor mutations: rejected because they can mutate incident state directly and bypass the War Room approval workflow.

### Decision: Count handoff events as the hard coordination limit

**Rationale**: The feature specification defines the limit as eight supervisor-directed handoffs. The count is deterministic and externally verifiable from the trace.

**Alternatives considered**:

- Count model calls or tool calls: rejected because they do not correspond to the specified coordination-step limit and may vary independently of role transfers.

## Open Questions

None. The feature specification defines role boundaries, route selection, trace visibility, and the handoff limit.
