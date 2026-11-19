# Implementation Plan: Context Budget by Section

**Branch**: `012-context-budget-sections` | **Date**: 2026-11-04 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/012-context-budget-sections/spec.md`

## Summary

Add a centralized ContextBuilder at `src/context-builder.ts` so React, plan-and-execute, reflection, and future strategies consume the same section-aware prompt policy. The builder validates environment budgets, preserves system and current-message sections, uses defaults of 100/300/100 for summary/history/memories, removes oldest history first, and removes lowest-score memories first.

## Technical Context

**Language/Version**: TypeScript with Node.js 22 LTS

**Primary Dependencies**: Zod, LangChain/LangGraph, existing `estimateTokens` utility

**Storage**: N/A; configuration and prompt sections remain in memory

**Testing**: Node.js `node:test` through `tsx`; isolated unit tests and strategy integration tests

**Target Platform**: OpsPilot server-side API

**Project Type**: Agent/service web application

**Performance Goals**: Prompt assembly is synchronous and negligible for normal history and memory sizes

**Constraints**: System and current request are never trimmed; budgets use the existing chars-per-four estimate; invalid environment values are rejected explicitly; tied memory scores use original order as the deterministic fallback

**Scale/Scope**: Three budgeted sections, two registered strategies, and reflection wrapper coverage

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Schema validation**: Pass. Environment budgets and builder inputs use Zod schemas.
- **Layered MVC**: Pass. Prompt assembly belongs in a context module; strategies consume it; persistence and HTTP remain unchanged.
- **Test-first changes**: Pass. Add ContextBuilder tests before strategy integration changes.
- **Explicit domain errors**: Pass. Invalid configuration uses an explicit configuration error and is not silently defaulted.
- **SQLite persistence**: Pass. The feature introduces no persistence.

**Gate Result**: PASS before research and after Phase 1 design.

## Project Structure

### Documentation (this feature)

```text
specs/012-context-budget-sections/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── context-builder.md
├── spec.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
src/
├── context-builder.ts       # Centralized budgeted section assembly
├── context-builder.test.ts  # Builder and strategy integration tests
├── context/
│   └── tokens.ts            # Existing character-based estimate
└── agents/
    ├── react.ts
    ├── plan-and-execute.ts
    └── reflection.ts
```

Tests are colocated with implementation in `src/**/*.test.ts`.

**Structure Decision**: Implement one context module at `src/context-builder.ts`, consumed by existing strategies without changing HTTP or persistence layers.

## Complexity Tracking

No constitution violations requiring justification.
