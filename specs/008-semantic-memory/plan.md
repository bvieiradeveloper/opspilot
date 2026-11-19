# Implementation Plan: Semantic User Memory

**Branch**: `master` (feature branch hook did not run) | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-semantic-memory/spec.md`

## Summary

Add user-scoped semantic memory to chat and a dedicated `/memories` management interface. A local sentence-embedding model converts saved facts and chat queries to normalized vectors; SQLite stores facts and vectors, and memory operations use user-scoped dot-product ranking for deduplication and top-three recall. `/chat` supplies recalled facts as contextual data and runs a learning reflector asynchronously after successful responses; natural-language forget requests and explicit HTTP deletion remove only the identified user's memory.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS.

**Primary Dependencies**: Express 5, Zod 4, LangChain/LangGraph, `@huggingface/transformers` (new runtime dependency).

**Storage**: SQLite via built-in `node:sqlite` `DatabaseSync`; add `memories(id, user_id, fact, embedding, created_at)` to the configured application database.

**Testing**: `node:test` through `tsx`; in-memory SQLite and deterministic injected embedding/reflection/strategy fakes for unit and HTTP tests, plus a local-model semantic integration test.

**Target Platform**: Node.js 22 service on the project's supported operating systems; CPU inference is the baseline.

**Project Type**: TypeScript web service with existing HTTP, service, agent, and SQLite store layers.

**Performance Goals**: Return no more than three eligible memories per recall; keep embedding-model initialization shared across concurrent first requests; do not wait for asynchronous learning before returning a chat response.

**Constraints**: Apply mean pooling and L2 normalization to 384-dimensional embeddings. Deduplicate only above 0.92; recall by descending dot product at or above 0.30. Scope every read and mutation by `userId`. Model inference is local after model artifacts are cached; an initial model download/cache preparation may require network access.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / constraint | Gate | Plan |
|---|---|---|
| Boundaries validated by Zod | PASS | Validate required `userId`, fact, memory identifier, chat request, and response at HTTP boundaries; validate internal embedding and memory records. |
| Layered MVC responsibilities | PASS | Keep route/controller handling in HTTP modules, use services for learning and chat orchestration, and isolate SQLite persistence and vector ranking in the memory store. |
| Test-first changes | PASS | Add `node:test` coverage for stores, embedding behavior, chat integration, reflection, and HTTP contracts; use in-memory SQLite for persistence tests. |
| Explicit domain errors | PASS | Use explicit validation/not-found/ambiguous-operation results and translate them to safe HTTP responses; report background reflector errors instead of silently swallowing them. |
| Secure and responsible operations | PASS WITH BOUNDARY | Partition every operation by caller-supplied `userId`; do not treat that value as authentication. As in the current application, caller identity verification remains an outer-system responsibility. Retrieved facts are untrusted contextual data, not instructions. |
| Runtime and persistence constraints | PASS | Use Node.js 22, TypeScript ESM, Express, SQLite `node:sqlite`, and no traditional database server. |
| Project workflow | PASS | Keep the spec and design artifacts versioned under `specs/008-semantic-memory/`; proceed to `/speckit-tasks` after this phase. |

No constitution violations require an exception.

## Project Structure

### Documentation (this feature)

```text
specs/008-semantic-memory/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── http-chat-and-memory.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── http/
│   ├── server.ts
│   └── server.test.ts
├── memory/
│   ├── embeddings.ts
│   ├── embeddings.test.ts
│   ├── memory-store.ts
│   └── memory-store.test.ts
├── services/
│   ├── chat-service.ts
│   ├── chat-service.test.ts
│   ├── learning-reflector.ts
│   └── learning-reflector.test.ts
└── agents/
    ├── reasoning.ts
    ├── tools.ts
    └── *.test.ts
```

**Structure Decision**: Extend the existing single Node.js service. Preserve the requested `src/memory/embeddings.ts` and `src/memory/memory-store.ts` boundaries; wire HTTP routes and request-scoped chat context into existing modules and follow the established `src/services` and `node:test` conventions. Keep HTTP contract tests beside the existing server tests and store tests beside the memory store.

## Phase 0: Research

See [research.md](./research.md). Decisions resolve model selection, vector representation, local cache initialization, user-scoped ranking, async learning, and test strategy.

## Phase 1: Design

- [Data model](./data-model.md) defines the SQLite memory row, vector validation, scoring, and ownership rules.
- [HTTP and chat contracts](./contracts/http-chat-and-memory.md) defines required `userId`, `/memories` creation/deletion, safe response behavior, and the in-chat learn/forget interactions.
- [Quickstart](./quickstart.md) describes executable validation scenarios without requiring a live OpenRouter call.

## Constitution Check (Post-Design)

| Gate | Result | Design verification |
|---|---|---|
| Zod boundary validation | PASS | The contracts specify schemas and explicit client errors for malformed input; internal persistence output is validated before use. |
| MVC separation | PASS | HTTP maps external requests to memory/chat services; model loading and persistence are encapsulated; learning orchestration is separate from routes. |
| Tests and SQLite | PASS | Store tests use isolated `:memory:` databases; embeddings and reflectors are injectable for deterministic tests; one integration test verifies meaning-based recall with the actual local model. |
| Domain errors | PASS | Unknown or cross-user memory identifiers map to the same not-found result; ambiguous chat forgetting asks for clarification; background failures are reported without changing the response already sent. |
| Privacy and operational safety | PASS WITH BOUNDARY | Queries and writes always include `userId`; the caller must supply an authenticated identity in deployments requiring authentication. Learned and recalled facts are delimited as data and cannot authorize operational actions. |
| Runtime and persistence | PASS | Design uses built-in SQLite and local CPU model inference, with no separate database service or remote embedding API. |

No constitution violations require an exception.

## Complexity Tracking

No constitution violations or additional project layers are introduced.
