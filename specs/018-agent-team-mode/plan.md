# Implementation Plan: Agent Team Mode

**Branch**: `main` | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/018-agent-team-mode/spec.md`

## Summary

Add an explicitly selectable `team` route for incident response. A bounded supervisor coordinates analyst, planner, and executor roles over a shared per-run blackboard, emitting a validated handoff event for each role transition. Keep the existing chat endpoint, request trace persistence, and approval workflow; the executor must use approval-aware incident operations and may not fall back to direct mutation tools.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode; Node.js 22 LTS

**Primary Dependencies**: Express 5, Zod 4, LangChain, LangGraph

**Storage**: Existing SQLite request-trace store for completed traces; the team blackboard is in-memory and scoped to one run

**Testing**: `node:test` through `tsx`; `npm run test`, `npm run typecheck`, and `npm run web:typecheck`

**Target Platform**: Node.js API and existing React web application

**Project Type**: Full-stack web service

**Performance Goals**: No run emits more than eight handoffs; complete within the existing request deadline (180 seconds by default)

**Constraints**: Preserve strict Zod validation at HTTP and trace boundaries; use existing MVC responsibilities and approval handling; do not add dependencies or persistence for transient team state; preserve current routes and default chat behavior.

**Scale/Scope**: One explicitly selected team run per chat request; three specialist roles; at most eight role handoffs; existing trace view and request lifecycle.

## Constitution Check

| Principle | Gate | Plan |
|---|---|---|
| I. Boundaries Validated by Schemas | PASS | Validate `team` route input, supervisor decisions, handoff events, and API responses with Zod; update the web trace parser. |
| II. Layered MVC Responsibilities | PASS | Keep role orchestration in `src/team/`, request dispatch and validation at the HTTP/controller boundary, and chat integration in services/graph orchestration. |
| III. Test-First Changes | PASS | Add focused unit, graph/API integration, trace-rendering, and role-permission tests; run the project test and typecheck scripts. |
| IV. Explicit Domain Errors | PASS | Reject invalid or unavailable team execution explicitly; do not convert supervisor parse failures into a success-shaped response. |
| V. Secure and Responsible Operations | PASS | Give each role only its permitted capabilities; route executor mutations through the existing approval-aware path and deny unsafe fallback. |

No constitution violations are proposed.
**Post-design gate**: PASS — the generated state model and contract preserve all five principles; no exceptions are required.

## Project Structure

### Documentation (this feature)

```text
specs/018-agent-team-mode/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── team-mode.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── team/                         # Team state, role capabilities, supervisor orchestration
├── graph/
│   ├── production-graph.ts        # Explicit team route dispatch
│   └── production-graph.test.ts
├── agents/
│   └── reasoning.ts              # Supported route and handoff trace type
├── services/
│   ├── chat-service.ts           # Pass validated route and shared request context
│   └── request-tracing-service.ts
├── http/
│   ├── server.ts                 # Request/response schemas and War Room safety gate
│   └── server.test.ts
└── store/
    └── request-trace-store.ts    # Route/trace event persistence schemas

web/src/
├── models/
│   ├── chat.ts                   # Team route request shape
│   └── trace.ts                  # Handoff trace validation
├── services/chat-api.ts
└── components/
    ├── Chat.tsx                  # Accessible team-mode selection
    ├── TraceEvent.tsx            # Human-readable handoff rendering
    └── TracePanel.test.tsx
```

Related colocated tests include `src/team/*.test.ts`, `src/graph/production-graph.test.ts`, `src/http/request-tracing.test.ts`, and `web/src/components/TracePanel.test.tsx`.

**Structure Decision**: Extend the existing single API plus web application. The team implementation belongs in the requested `src/team/` area and is reached through the existing `/chat` strategy-selection contract; it does not introduce a second chat endpoint or a separate persistence layer.

## Design Decisions

- The team route is opt-in. Keep automatic routing limited to the existing strategies; do not silently select team mode.
- The supervisor's validated decision contains a `next` role or a terminal choice plus a concise `brief`. A role transition becomes a handoff trace event with source, destination, and brief. A terminal choice is not a handoff.
- Count each emitted role transition toward the eight-handoff limit. Once the limit is reached, do not request or emit another transition; return the available result or an explicit limit outcome.
- Keep the blackboard scoped to one invocation. Persist only the resulting trace through the existing request tracing lifecycle.
- Analyst tools are read-only; the planner receives no tools; the executor receives only incident operations. State-changing executor calls must use approval-aware tools. Team mode must not run through a legacy path that exposes direct mutation tools.
- Use the existing `Ver raciocínio` panel and append a dedicated handoff renderer; do not expose hidden internal reasoning.
- Preserve existing chat behavior and existing routes when team mode is not selected.

## Complexity Tracking

No constitution violations; no entries required.
