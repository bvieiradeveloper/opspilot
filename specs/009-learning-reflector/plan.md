# Implementation Plan: Safe Learning Reflector

**Branch**: `009-learning-reflector` | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-learning-reflector/spec.md`

## Summary

Add selective automatic learning and explicit preference forgetting to the existing user-scoped memory capability. After the HTTP response is sent, a structured learning assessment examines only the latest user message and either returns no candidate or one concise durable fact. Eligible facts are saved asynchronously through the existing deduplicating memory operation; likely secrets and transient requests are rejected. Add a `forget_preference` agent tool whose owner scope is bound by the application, not supplied by model-generated arguments, and which removes a memory only after resolving one unambiguous target.

## Technical Context

**Language/Version**: TypeScript ESM, strict; Node.js 22 LTS

**Primary Dependencies**: Express 5, LangChain/LangGraph, `@langchain/openai`, Zod 4, Transformers.js

**Storage**: Existing SQLite-backed `MemoryStore`; no new persistence store or table

**Testing**: `node:test` through `tsx`; injected model, memory store, strategy, and error-reporting fakes

**Target Platform**: Node.js service

**Project Type**: Express web service with agent workflows

**Performance Goals**: Return the chat response without waiting for learning assessment or memory save; retain the existing memory recall and response behavior

**Constraints**: Inspect only the latest user message for learning; reject transient requests and secret-like content; bind all memory reads/deletions to the validated request user; validate structured model output; report asynchronous failures without affecting the sent response; do not read `.env` in application code

**Scale/Scope**: One learning assessment per successful chat response; at most one concise fact retained per assessment; one explicit preference-forgetting operation per tool invocation

## Constitution Check

| Principle / constraint | Status | Plan |
|---|---|---|
| Boundaries validated by schemas | PASS | Validate the structured assessment and tool inputs with Zod; continue validating HTTP inputs at the existing boundary. |
| Layered MVC responsibilities | PASS | Keep assessment and learning orchestration in a service, memory persistence in the existing store, and HTTP response/background dispatch in the controller. |
| Test-first changes | PASS | Add unit and HTTP integration tests with injected fakes; run `npm run test` and `npm run typecheck`. |
| Explicit domain errors | PASS | Reuse existing memory domain errors and translate tool outcomes into explicit results; report asynchronous assessment/save failures. |
| Secure and responsible operations | PASS | Never accept the owner ID from tool arguments; use validated request scope, reject sensitive candidates conservatively, and avoid logging message content or candidate secrets. |
| Technology constraints | PASS | Reuse Node 22, TypeScript, Express, Zod, LangChain, SQLite `node:sqlite`, and existing package scripts. |

**Gate result**: PASS. No constitution deviations or additional storage are required.

## Project Structure

### Documentation (this feature)

```text
specs/009-learning-reflector/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── chat-learning-tools.md
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── reasoning.ts                 # Add the forget tool name to the agent tool contract
│   ├── tools.ts                     # Create request-scoped forget_preference tool
│   ├── react.ts                     # Bind the validated user scope to memory tools
│   └── index.ts                     # Preserve strategy construction/injection boundaries
├── http/
│   ├── server.ts                    # Dispatch learning after sending a successful response
│   └── server.test.ts               # Verify no response wait and correct request scope
├── memory/
│   └── memory-store.ts              # Reuse existing remember, list, and forget operations
└── services/
    ├── learning-reflector.ts        # Structured assessment and eligible asynchronous save
    └── learning-reflector.test.ts   # Eligibility, secret exclusion, and failure behavior
```

**Structure Decision**: Extend the existing single Node.js service and memory/agent boundaries. Keep user-facing forgetting in the existing chat tool workflow and invoke the post-response learning service from the HTTP controller after sending the response. Do not duplicate memory storage or introduce a new route.

## Complexity Tracking

No constitution violations; no complexity justification required.

## Phase 0: Research

See [research.md](./research.md). It records decisions for structured assessment, sensitive-data exclusion, response timing, memory reuse, and request-scoped forgetting. No unresolved technical clarifications remain.

## Phase 1: Design

- [Data model](./data-model.md) describes the transient learning assessment and its relationship to existing user memories.
- [Chat and tool contracts](./contracts/chat-learning-tools.md) specifies structured assessment output and the request-bound `forget_preference` tool.
- [Quickstart](./quickstart.md) lists focused unit, HTTP, and typecheck validation.

**Post-design Constitution Check**: PASS. The design preserves schema validation, MVC boundaries, test coverage, explicit error reporting, and user-scoped security.
