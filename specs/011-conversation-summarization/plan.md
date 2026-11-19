# Implementation Plan: Conversation History Summarization

**Branch**: `011-conversation-summarization` | **Date**: 2026-10-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-conversation-summarization/spec.md`

## Summary

Add persistent merged summaries for conversation history. Preserve the newest 8 prior messages as direct context and summarize complete 8-message batches that have crossed the pruning boundary. Summaries are stored once per conversation, merged with the previous summary, and included in model context; successful refreshes emit a `summarize` trace event. Concurrent refreshes use the persisted pruning watermark as the synchronization point.

## Technical Context

**Language/Version**: TypeScript with Node.js 22 LTS

**Primary Dependencies**: Express, Zod, LangChain/LangGraph, `node:sqlite` (`DatabaseSync`)

**Storage**: SQLite `conversation_summaries` table associated with conversations

**Testing**: Node.js `node:test` through `tsx`, with in-memory SQLite and deterministic summarizer adapters

**Target Platform**: OpsPilot server-side API

**Project Type**: Web service using Model, Service, and Controller layers

**Performance Goals**: No summarizer call or summary write on requests outside a completed 8-message boundary; at most one persisted refresh per boundary

**Constraints**: Approximately 150-token summary; newest 8 prior messages remain direct context; no external model service in tests; never persist secrets

**Scale/Scope**: One summary per conversation and batches of exactly 8 retired messages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Schema validation**: Pass. External inputs, chat output, and the new trace event remain Zod-validated.
- **Layered MVC**: Pass. Persistence belongs in the conversation store, pruning and merge policy in the chat service, and transport exposure in the HTTP controller.
- **Test-first changes**: Pass. Store, pruning, merge, no-op boundary, event, context, concurrency, and failure behavior require automated tests.
- **Explicit domain errors**: Pass. Summarization failures use existing domain-error boundaries and preserve previous persisted state.
- **SQLite persistence**: Pass. The feature uses `node:sqlite` and an isolated in-memory database for tests.

**Gate Result**: PASS before research and after Phase 1 design.

## Project Structure

### Documentation (this feature)

```text
specs/011-conversation-summarization/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── chat-history-summarization.md
├── spec.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── store/
│   ├── conversation-store.ts
│   └── sqlite-conversation-store.ts
├── services/
│   └── chat-service.ts
├── agents/
│   └── reasoning.ts
└── http/
    └── server.ts
```

Tests are colocated with implementation in `src/**/*.test.ts`.

**Structure Decision**: Extend the existing SQLite conversation store and chat service. Introduce a small service-level summarizer interface so tests can inject a deterministic implementation without changing HTTP behavior or reasoning strategies.

## Complexity Tracking

No constitution violations requiring justification.