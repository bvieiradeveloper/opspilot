# Implementation Plan: External Provider Status

**Branch**: `[004-provider-status]` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-provider-status/spec.md`

## Summary

Add an agent tool that reports current public status for GitHub or Cloudflare, defaulting to
GitHub. It will validate the provider response, limit each request attempt to five seconds, retry
once after a timeout, network failure, or HTTP 5xx response, and return concise status or error
observations without allowing a final lookup failure to escape as an exception. The implementation
will follow the existing agent-tools pattern and allow fetch to be substituted for deterministic
tests.

## Technical Context

**Language/Version**: TypeScript ESM, strict mode, Node.js 22 LTS

**Primary Dependencies**: Existing `@langchain/core` tool factory and Zod 4; built-in Fetch API

**Storage**: N/A; provider observations are transient and are not persisted

**Testing**: Node.js `node:test` through `tsx`; existing `src/agents/tools.test.ts`; `npm run typecheck`

**Target Platform**: Node.js 22 server

**Project Type**: Agent-enabled Express web service

**Performance Goals**: Each network attempt is bounded to five seconds; a failed lookup has at most
  two attempts, and the tool returns a single compact line.

**Constraints**: Use the public GitHub and Cloudflare status JSON endpoints without credentials.
Validate `{ status: { indicator, description } }` using Zod. Retry only timeout, network, and HTTP
5xx failures once; report other HTTP errors and invalid response data without retrying. A final
failure is a readable tool result, not an exception escaping the tool.

**Scale/Scope**: One new provider-status tool, supporting exactly GitHub and Cloudflare; no status
history, incident lifecycle changes, persistence, or additional providers.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Boundaries Validated by Schemas**: Pass. Restrict the tool input to the supported provider
  enum and validate the external status payload with Zod before using it.
- **II. Layered MVC Responsibilities**: Pass. This is agent-tool integration and external status
  observation, not persistence or transport logic; keep it in the existing agent tools module and
  avoid changing model, service, or controller responsibilities.
- **III. Test-First Changes**: Pass. Extend the existing agent-tools test suite with fake-fetch
  tests, then run the focused tests and typecheck.
- **IV. Explicit Domain Errors**: Pass. A failed external lookup is an observation returned by the
  tool, not a domain exception; do not swallow unrelated exceptions.
- **V. Secure and Responsible Operations**: Pass. Use public endpoints without credentials and do
  not access `.env`; report uncertainty instead of claiming provider health when lookup fails.

**Gate result**: PASS. No constitution deviation or unresolved design question blocks planning.

## Project Structure

### Documentation (this feature)

```text
specs/004-provider-status/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── contracts/
    └── provider-status-tool.md
```

### Source Code (repository root)

```text
src/
└── agents/
    ├── tools.ts
    └── tools.test.ts
```

**Structure Decision**: Follow the existing single-project TypeScript layout and the colocated
agent tools tests. Implement the feature in `src/agents/tools.ts` and cover it in
`src/agents/tools.test.ts`; no new source directories or production dependencies are needed.

## Complexity Tracking

No constitution violations; no additional complexity requires justification.
