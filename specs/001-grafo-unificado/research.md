# Phase 0 Research: Grafo Unificado

## Decision: Single production graph owns the chat execution flow

**Decision**: Add `src/agents/production-graph.ts` as the production orchestration entry point with context, router, three strategy nodes, and response nodes.

**Rationale**: A graph provides one explicit state machine, deterministic node attribution, and one place for route and response behavior.

**Alternatives considered**:
- Keep separate direct strategy calls in the HTTP controller: rejected because routing and node-level tracing would remain transport-coupled.
- Add only a router service without graph edges: rejected because it would not provide a unified execution flow.

## Decision: Structured routing output

**Decision**: Use a Zod-backed structured output schema containing `route` and `reason`; routing validates the result before it changes graph state.

**Rationale**: The model decision and application control flow share one typed contract, while invalid route values are rejected rather than interpreted dynamically.

**Alternatives considered**:
- Free-text routing followed by string parsing: rejected because route values would be ambiguous and less testable.
- Keep automatic selection out of the graph: rejected because the requested router must be an observable graph node.

## Decision: Supported routes

**Decision**: Route only to `react`, `plan-and-execute`, or `reflect:react`. The reflection route wraps the existing reflection behavior around ReAct; the user-facing `reflect` request option can still enable reflection but is normalized as an explicit override to `reflect:react`.

**Rationale**: This reuses the application’s existing strategy implementations instead of introducing a fourth execution model.

**Alternatives considered**:
- Three route names independent from existing strategy names: rejected because it would duplicate registry concepts.
- Replace reflection with a fourth standalone implementation: rejected because reflection is already a wrapper behavior.

## Decision: Override behavior

**Decision**: An optional chat `strategy` is validated against the route table. A valid value bypasses the model router and becomes a routing event with `route`, `reason`, and `node: "router"`; no automatic route call is made for that request.

**Rationale**: This preserves explicit deterministic selection and makes override behavior visible in the same trace structure.

**Alternatives considered**:
- Run automatic routing and then replace its output: rejected because it creates an unnecessary model call and can hide intent.
- Silently ignore unsupported overrides: rejected because it conflicts with existing unknown-strategy error behavior.

## Decision: Trace model

**Decision**: Extend every trace event with a required string `node`. Stable node names are `context`, `router`, `react`, `plan-and-execute`, `reflection`, and `response`. Router decisions use type `route`; existing strategy event types remain unchanged.

**Rationale**: Every event has a stable origin without changing existing strategy-specific trace payloads.

**Alternatives considered**:
- Store graph node only in a top-level response field: rejected because it cannot attribute individual events.
- Generate node names from class or method names: rejected because names become unstable and implementation-dependent.

## Decision: Context construction

**Decision**: Reuse `buildContext` before the router. The graph passes bounded summary, history, and memories to routing and strategy nodes; existing context metrics are merged into the response.

**Rationale**: This preserves current token limits and avoids creating a second context implementation.

**Alternatives considered**:
- Build separate context views for each node: rejected because it could produce inconsistent routing and execution inputs.

## Resolved clarification

Automatic routing fallback is `react` when the routing model returns an unrecognized value. Strong routing failures remain processing errors only when no valid structured result can be obtained; a recognized fallback route does not count as a model-level failure.
