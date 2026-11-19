# Implementation Plan: War Room Web Console

**Branch**: `016-war-room-web` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/016-war-room-web/spec.md`

## Summary

Add a responsive, accessible War Room chat client under `/opspilot/` and extend the existing Express API for browser CORS, server-configured single-operator identity, idempotent chat retries, and approval-gated incident mutations. Select these changes only for War Room requests; preserve the tested MCP, CLI, and legacy HTTP tool paths. Render Markdown and trace payloads as untrusted content, persist retry outcomes and pending approvals in SQLite, and require explicit approval before opening or resolving incidents in the War Room.

## Technical Context

**Language/Version**: Node.js 22 LTS and strict TypeScript ESM for the API; TypeScript/TSX targeting modern browsers for the web client.

**Primary Dependencies**: Existing Express 5 and Zod 4 API; the `cors` middleware with `@types/cors`; Vite, React, Tailwind CSS 4 with its Vite plugin, React Markdown, `remark-gfm`, and `rehype-sanitize` for the web client. JSDOM and React Testing Library provide DOM-backed component tests. Dependencies will be locked in the repository package lock.

**Storage**: Existing SQLite persistence via `node:sqlite`; add SQLite stores for approval lifecycle and idempotent chat outcomes. Keep API URL and theme preferences in browser storage. Chat messages and pending approvals are not copied into browser storage.

**Testing**: `node:test` through `tsx` for API, store, service, and web component tests; JSDOM and React Testing Library for observable UI behavior. Run the existing strict TypeScript check, the web TypeScript check, and a production Vite build.

**Target Platform**: Modern evergreen desktop and mobile browsers. Static web assets are served beneath `/opspilot/`; the API is hosted at a separately configurable HTTP(S) origin.

**Project Type**: Existing Node.js HTTP service plus a separate `web/` Vite application managed in the root npm workspace.

**Performance Goals**: Show pending/loading feedback immediately on send and approval; do not add synchronous work before dispatching requests. Chat completion time remains governed by the existing API/model deadline.

**Constraints**: API base URL must be an absolute HTTP(S) URL and must not contain credentials. CORS must use an explicit `OPSPILOT_WEB_ORIGINS` allowlist and handle preflight; CORS is not authentication. One stable `userId` is configured server-side with `OPSPILOT_USER_ID` for a single-operator installation; the API must not be exposed outside its trusted network perimeter without adding authentication. Markdown raw HTML is disabled and output sanitized. New HTTP input/output is validated with Zod. Never read or commit `.env` or other secrets.

**Scale/Scope**: One operator per deployment; one active conversation in the client; trace inspection and approval cards for incident-opening and incident-resolution actions. Read-only operational tools remain autonomous. Multi-operator access, login/SSO, conversation browsing, and browser persistence of transcripts are out of scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Result |
|---|---|---|
| Boundaries validated by schemas | Validate chat, approval, settings, and API responses with Zod before use. | PASS |
| Layered MVC responsibilities | Keep HTTP routing in controllers, approval policy/state transitions in services, and SQLite operations in stores/models; keep browser API calls outside presentational components. | PASS |
| Test-first changes | Add `node:test`/`tsx` coverage for new API, approval state, CORS, and web interactions; run tests and both strict typechecks. | PASS |
| Explicit domain errors | Map invalid input, missing approvals, conflicting decisions, and execution failures to safe HTTP responses. | PASS |
| Secure and responsible operations | Use server-side single-installation identity, narrowly allowlisted CORS, safe Markdown/trace output, and persist approval before any operational mutation. The deployment must restrict network access because CORS alone does not authorize an operator. | PASS WITH DEPLOYMENT GATE |
| Project and persistence constraints | Keep the API on Express/SQLite and the browser client in `web/`; do not introduce a database server or secrets. | PASS |

**Pre-design gate**: Pass for the stated single-operator, network-restricted deployment. A public or multi-operator deployment is blocked until an authentication/authorization mechanism is specified and implemented; adding CORS does not satisfy this gate.

**Post-design gate**: Re-checked after defining the API and persistence contracts. Approval decisions are tied to the pending record and installation identity; incident changes happen only after a validated approval and an atomic pending-state claim. No constitution violation remains for this scope.

## Project Structure

### Documentation (this feature)

```text
specs/016-war-room-web/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── chat-and-approval-http.md
│   └── war-room-ui.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── agents/                 # Add approval-aware wrappers for incident mutations
├── http/
│   ├── server.ts           # CORS, chat 202 responses, approval endpoint
│   └── ...                 # Zod request/response contracts
├── services/
│   ├── chat-service.ts
│   └── approval-service.ts # Approval lifecycle and safe action dispatch
└── store/
    ├── approval-store.ts
    ├── sqlite-approval-store.ts
    ├── chat-idempotency-store.ts
    └── sqlite-chat-idempotency-store.ts

web/
├── index.html
├── vite.config.ts          # base: /opspilot/
├── tsconfig.json
└── src/
    ├── app/                # Application shell, theme, settings
    ├── components/         # Chat, approval cards, trace drawer, Markdown
    ├── services/           # API client and Zod response validation
    └── *.test.tsx          # node:test / tsx component tests
```

**Structure Decision**: Keep the current Express API and its MVC-style `src/` layout. Add `web/` as a separate npm workspace so browser dependencies and Vite configuration stay out of the server TypeScript project. Root scripts expose web development, build, and typecheck commands and aggregate the web tests with existing `node:test` coverage. The web client is deployed as static assets under `/opspilot/`; it does not require the Express server to serve frontend files.

## Phase 0: Research

Research decisions and sources are recorded in [research.md](research.md). Key decisions:

- Configure Vite's `base` as `/opspilot/`, and verify generated assets through a production build.
- Use exact-origin CORS allowlisting, with no credentialed requests unless a future auth feature requires them.
- Use React Markdown with GFM and a sanitization schema; do not enable raw HTML. Render traces and tool arguments as text.
- Use Tailwind's Vite plugin and semantic, keyboard-operable controls.
- Honor the constitution's `node:test` requirement instead of adopting Vitest; use JSDOM/Testing Library for component behavior.
- Configure one stable server-side operator identity for this single-operator deployment. The web client submits only the message and conversation ID.
- Gate `open_incident` and `resolve_incident`; keep read-only operational lookups automatic. Persist proposals and decisions in SQLite.
- Add a stable idempotency key to each message request so retries replay the original outcome instead of re-running the agent or an action.

## Phase 1: Design

- [data-model.md](data-model.md) defines browser state, chat/trace data, installation identity, and durable approval state.
- [contracts/chat-and-approval-http.md](contracts/chat-and-approval-http.md) documents chat status `200`/`202`, the decision endpoint, error shapes, and CORS expectations.
- [contracts/war-room-ui.md](contracts/war-room-ui.md) defines the visible chat, trace, settings, and approval interaction contract.
- [quickstart.md](quickstart.md) defines API/UI startup, automated validation, base-path checks, and manual keyboard/responsive checks.

## Complexity Tracking

No constitution violations or additional project layers are introduced. A separate `web/` workspace is necessary to isolate browser dependencies and configure Vite's non-root deployment path without coupling the API runtime to the browser build.
