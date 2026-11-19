# Implementation Plan: Grafo Unificado

**Branch**: `001-grafo-unificado` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-grafo-unificado/spec.md`

## Summary

Create a single production LangGraph flow for `/chat` that prepares bounded context, automatically routes each request to one of three strategies, executes that strategy, and returns a unified trace. Existing ReAct, plan-and-execute, and reflection-capable execution remain the three strategy implementations. Chat strategy selection remains optional and becomes an explicit routing override when supplied.

## Technical Context

**Language/Version**: TypeScript 7 with Node.js 22 ESM and strict type checking

**Primary Dependencies**: LangChain, LangGraph, OpenRouter-backed chat model, Zod, Express

**Storage**: Existing conversation and memory stores; routing state is request-scoped and in memory

**Testing**: Node.js `node:test` executed through `tsx`, HTTP integration tests, graph unit tests, and TypeScript typecheck

**Target Platform**: Express API server on Node.js

**Project Type**: Single web-service API with MVC-style layers

**Performance Goals**: Preserve current timeout behavior; routing adds one model call only when no valid override is provided

**Constraints**: No secrets committed, external chat input validated by Zod, bounded context reused, trace node names stable and deterministic

**Scale/Scope**: One production graph, three strategy nodes, one HTTP endpoint, request-scoped state only

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Schema validation**: Pass. `/chat` input and output remain Zod-validated; routing output uses structured schema validation.
- **Layered MVC**: Pass. The graph belongs in the agent layer, orchestration in service/application code, and HTTP concerns in the controller/server layer.
- **Test-first behavior**: Pass. Add focused graph, trace, override, and HTTP tests before finalizing implementation.
- **Domain errors**: Pass. Unknown overrides use the existing domain-error translation path and routing failures use explicit processing errors.
- **Security/responsibility**: Pass. Routed inputs, trace node attribution, and external outputs are explicit and bounded.

## Project Structure

### Documentation (this feature)

```text
specs/001-grafo-unificado/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── chat-route-contract.md
├── spec.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── index.ts
│   ├── production-graph.ts
│   ├── reasoning.ts
│   ├── react.ts
│   ├── plan-and-execute.ts
│   └── reflection.ts
├── context-builder.ts
├── services/
│   └── chat-service.ts
└── http/
    └── server.ts
```

**Structure Decision**: Extend the existing single-project Express API. The new production graph will centralize graph orchestration in `src/agents/production-graph.ts`; existing strategies remain reusable strategy implementations.

## Complexity Tracking

No constitution violations are expected.

## Phase 0 Design Decisions

See `research.md` for structured-routing, state, override, and trace decisions.

## Phase 1 Interfaces and Validation

See `data-model.md`, `contracts/chat-route-contract.md`, and `quickstart.md`.
