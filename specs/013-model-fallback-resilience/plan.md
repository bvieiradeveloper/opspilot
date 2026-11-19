# Implementation Plan: Model Fallback Resilience

**Branch**: `013-model-fallback-resilience` | **Date**: 2026-11-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-model-fallback-resilience/spec.md`

## Summary

Make model calls resilient by retrying the configured primary twice in total, then using an
optional OpenRouter fallback with the same two-attempt limit. Report the model that produced the
response and a fallback trace event. If no configured model produces a usable response, propagate
a typed domain failure to the HTTP boundary and return a safe 503 response. Keep model
orchestration shared across direct chat, structured-output, routing, reflection, and
summarization call sites.

## Technical Context

**Language/Version**: TypeScript 7, ESM, strict mode; Node.js 22 LTS

**Primary Dependencies**: `@langchain/core` 1.2.12, `@langchain/openai` 1.5.13,
`@langchain/langgraph` 1.4.17, Express 5.2, Zod 4.6

**Storage**: No new persistence; model selection and fallback are per invocation.

**Testing**: `node:test` through `tsx`; `npm run test` and `npm run typecheck`

**Target Platform**: Node.js HTTP service using OpenRouter

**Project Type**: Express web service with internal agent strategies

**Performance Goals**: Do not add more than two attempts for each configured model per invocation;
preserve the existing request deadline.

**Constraints**: Use the existing OpenRouter API key and primary model configuration; fallback
configuration is optional. Do not read `.env` directly or expose provider error details. Preserve
structured-output behavior and test model calls without network access.

**Scale/Scope**: One primary and at most one fallback model for calls made by the model factory;
no persistence or new external endpoints.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Boundaries Validated by Schemas**: Pass. Validate model configuration, the expanded chat
  response metrics, and the new trace event with Zod at their existing boundaries.
- **Layered MVC Responsibilities**: Pass. Keep model selection in the model factory, execution
  failure as a domain error, and HTTP status translation in the Express boundary.
- **Test-First Changes**: Pass. Add isolated tests for model selection, metrics/trace, and HTTP
  failure mapping; run the repository test and typecheck scripts.
- **Explicit Domain Errors**: Pass. Represent exhausted model attempts with a dedicated error and
  translate it to a safe HTTP response.
- **Secure and Responsible Operations**: Pass. Never expose API keys, raw provider errors, or
  `.env` contents; model IDs may be returned as operational metrics.
- **Technology Constraints**: Pass. Reuse existing TypeScript, LangChain, Express, Zod, and
  `node:test` stack; do not add dependencies or persistence.

## Project Structure

### Documentation (this feature)

```text
specs/013-model-fallback-resilience/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── chat-api.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── agents/
│   ├── model.ts                  # Model configuration, retry/fallback composition
│   ├── model.test.ts             # Offline model factory and fallback tests
│   ├── errors.ts                 # Typed model-unavailable domain error
│   ├── reasoning.ts              # Trace and metrics contracts
│   ├── metrics.ts                # Per-run model-used and fallback observations
│   ├── trace.ts                  # Human-readable fallback event formatting
│   ├── react.ts                  # Strategy callback/trace propagation
│   ├── plan-and-execute.ts       # Structured model callback/trace propagation
│   └── reflection.ts             # Combined metrics and fallback traces
├── graph/
│   └── production-graph.ts       # Preserve model-unavailable failures from routing
├── services/
│   ├── chat-service.ts           # Preserve typed failure from auxiliary model use
│   └── conversation-summarizer.ts # Do not obscure model-unavailable failures
└── http/
    ├── server.ts                 # Validate response and map model exhaustion to 503
    └── server.test.ts            # Contract tests for trace, metrics, and 503
```

**Structure Decision**: Use the existing single TypeScript service structure and extend the model,
agent, service, and HTTP boundary modules that already own these responsibilities. No new runtime
layer or package is needed.

## Post-Design Constitution Check

- **Boundaries Validated by Schemas**: Pass. The chat response schema and trace event union will
  validate the new success fields; model configuration stays validated in the factory.
- **Layered MVC Responsibilities**: Pass. The shared model factory owns candidate composition,
  domain errors cross service boundaries unchanged, and only the HTTP edge chooses 503.
- **Test-First Changes**: Pass. Deterministic factory, callback, trace, and HTTP tests are planned;
  no live provider call is required for the quality gates.
- **Explicit Domain Errors**: Pass. Fallback exhaustion has a dedicated typed error and safe
  boundary mapping; wrapper catches must preserve it.
- **Secure and Responsible Operations**: Pass. Trace and metrics carry configured model IDs only;
  raw provider failures and credentials are excluded.
- **Technology Constraints**: Pass. Existing dependencies and scripts suffice; no persistence or
  package changes are planned.

## Complexity Tracking

No constitution violations or added architectural complexity.
