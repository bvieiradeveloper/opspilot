# Implementation Plan: Context Token Metrics

**Branch**: `[010-context-token-metrics]` | **Date**: 2026-10-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-context-token-metrics/spec.md`

## Summary

Add request-scoped token instrumentation without conflating model-reported prompt usage with estimates. A shared context measurement component will calculate `Math.floor(text.length / 4)`, gather complete actual input-token usage from LangChain `handleLLMEnd` results, and accumulate approximate counts for the stable `request`, `history`, `memories`, `toolResults`, and `reflection` source keys. Expose both through the existing `/chat` metrics contract, propagate one callback through agent, planner/replanner, and reflection calls, and print the actual per-turn value in `scripts/conversa-longa.sh`.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS; Bash for the long-conversation script

**Primary Dependencies**: LangChain JS (`@langchain/core` 1.2.x, `@langchain/openai` 1.5.x), LangGraph 1.4.x, Express 5, Zod 4, Node.js `node:test` through `tsx`

**Storage**: None; measurements are request-scoped and returned in the existing `/chat` response

**Testing**: Focused `node:test` coverage via `npm test` and project-wide `npm run typecheck`; deterministic model fakes and local HTTP/script fixtures, with no external model provider

**Target Platform**: Node.js 22 service; Bash-compatible environment for `scripts/conversa-longa.sh`

**Project Type**: Express web service with agent strategies and an operational CLI script

**Performance Goals**: Token estimates are computed in linear time over measured text and add no model or network calls; metrics collection must not materially affect request latency

**Constraints**: Preserve existing response fields; actual `promptTokens` must remain distinct from estimates; if there are no model calls or any model call lacks usable input-token usage, the complete actual request total is `null`; estimated breakdown is diagnostic and may not equal provider totals; do not persist metrics or add dependencies

**Scale/Scope**: One chat request across all model calls and strategy phases, including reflection, planning/replanning, and agent tool loops; estimate explicitly attributable prompt text by source

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Boundaries Validated by Schemas**: Pass. Extend the existing Zod `/chat` response schema to validate nullable actual usage and non-negative integer estimates for known source keys.
- **Layered MVC Responsibilities**: Pass. Keep usage collection and source attribution in context/agent services; keep the HTTP layer limited to validating and returning the response contract.
- **Test-First Changes**: Pass. Add unit, strategy, API contract, and script coverage with deterministic inputs and no provider access.
- **Explicit Domain Errors**: Pass. The feature adds metrics only and introduces no new expected domain failures.
- **Secure and Responsible Operations**: Pass. No secrets, environment changes, persistent prompt storage, or new operational actions are introduced.
- **Technology Constraints**: Pass. Use the existing runtime, LangChain stack, Zod boundaries, and Node test runner; no database or dependency changes.

**Gate result**: PASS. No constitution violations or unresolved technical choices block research or design.

**Post-design gate**: PASS. The callback source and supported usage metadata have been researched; missing usage is explicitly represented as unavailable, estimates are scoped to known application-attributed sources, and the design adds no persistence, dependency, or boundary-validation exceptions.

## Project Structure

### Documentation (this feature)

```text
specs/010-context-token-metrics/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── chat-metrics.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── context/
│   ├── tokens.ts
│   └── tokens.test.ts
├── agents/
│   ├── reasoning.ts
│   ├── metrics.ts
│   ├── react.ts
│   ├── plan-and-execute.ts
│   ├── reflection.ts
│   ├── metrics.test.ts
│   ├── react.test.ts
│   ├── plan-and-execute.test.ts
│   └── reflection.test.ts
├── services/
│   └── chat-service.ts
└── http/
    ├── server.ts
    └── server.test.ts
scripts/
└── conversa-longa.sh
```

**Structure Decision**: Use the existing single-project layout. Add `src/context` for the reusable estimator and request-scoped source accounting, extend the existing reasoning/agent metrics path for actual usage, and preserve `/chat` as the sole API surface. Add no persistence layer or standalone test framework.

## Complexity Tracking

No constitution violations; no complexity exceptions required.
