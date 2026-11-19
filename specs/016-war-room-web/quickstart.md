# Quickstart: War Room Web Console

## Prerequisites

- Node.js 22 LTS and npm.
- The API and frontend are in the same repository; the frontend uses a separate API origin.
- For the single-operator setup, provide `OPSPILOT_USER_ID` as a stable server-side identity and restrict API network access to the trusted operator environment. CORS configuration alone does not provide authorization.
- For a live model-backed chat, configure the API's existing model provider environment as described in the project README. Tests use deterministic strategies and do not call a model provider.

## Install and run

Install the root npm workspace:

```powershell
npm install
$env:OPSPILOT_USER_ID = "oncall-primary"
$env:OPSPILOT_WEB_ORIGINS = "http://localhost:5173"
npm run dev
```

In another PowerShell terminal:

```powershell
npm run web:dev
```

Open the Vite URL at the `/opspilot/` path. Use the gear control to set the API base URL to `http://localhost:3000` (or the configured local API address). The first submitted message omits a conversation ID; later turns use the ID returned by the API.

## Automated validation

```powershell
npm test
npm run typecheck
npm run web:typecheck
npm run web:build
```

Expected outcomes:

- Existing backend tests and new API, approval-store, and UI tests pass.
- Both server and browser TypeScript projects typecheck without emitting files.
- The production Vite build succeeds with generated asset references beneath `/opspilot/`.

Additional web checks:

```powershell
npm run web:typecheck
npm run web:build
```

`npm test` includes the server and browser `node:test` suites. Existing chat callers without `Idempotency-Key` continue to use their explicit `userId` and existing `200` contract; the War Room supplies no user identity and uses the server-configured operator.

Use the selectors documented in [chat-and-approval-http.md](contracts/chat-and-approval-http.md) and [war-room-ui.md](contracts/war-room-ui.md) for request/response and UI expectations.

## End-to-end scenarios

1. **Chat context and retry**: Send a question, verify one `POST /chat`, receive `200`, then send a follow-up and verify its request includes the returned `conversationId`. Retry the first request with the same idempotency key and verify the response is replayed without a duplicate turn.
2. **Trace audit**: Use a deterministic fake strategy that returns `thought`, `action`, `observation`, and `answer`; open "Ver raciocínio" and verify categories, arguments, and observations appear in source order.
3. **Approval gate**: Ask for an incident change; verify `202`, the pending action card, and no store mutation. Reject it and verify state remains unchanged. Repeat with approval and verify the mutation occurs exactly once after confirmation.
4. **CORS and configuration**: Send the browser request from the configured frontend origin and verify the preflight and response headers; use a disallowed origin and verify it is not granted access. Save a valid API URL, reload, and confirm the setting remains; invalid URLs must be rejected.
5. **Responsive and keyboard behavior**: At a narrow viewport, navigate the chat, settings, trace panel, and approval controls using only the keyboard. Verify focus visibility, Escape dismissal, status announcements, and no page-wide horizontal scrolling.
6. **Safe Markdown**: Render GFM tables/lists/code plus hostile raw HTML and unsafe links. Verify the requested formatting appears while active HTML and unsafe destinations do not execute.

For static deployment validation, build and serve the output beneath `/opspilot/`, then load and reload that exact prefixed path. `vite preview` is a local validation server only, not a production hosting service.

## Validation record

Validated on 2026-11-12. The production preview was opened at `/opspilot/`; browser UI requests used a deterministic intercepted API, while CORS, retry, and approval persistence were verified against deterministic HTTP tests.

| Scenario | Result | Evidence |
|---|---|---|
| `/opspilot/` asset loading and direct route | PASS | Production preview loaded the title and entry assets at the configured path; base-path smoke test passed. |
| Chat first turn, follow-up, and retry key | PASS | Browser request inspection showed omitted first `conversationId`, returned ID on follow-up, and stable idempotency headers; server tests verified replay without another turn. |
| Trace ordering, keyboard close, and focus return | PASS | Browser trace panel opened and closed with Escape; component tests verify source ordering and opener focus restoration. |
| Approval card and confirmed approval | PASS | Browser mock rendered the pending card and updated after approval; HTTP/service tests verify rejection, idempotent approval, and no repeated mutation. |
| CORS preflight and disallowed origin | PASS | HTTP tests verify exact-origin allowlist, required headers, and no credentialed CORS response. |
| Unsafe Markdown and GFM formatting | PASS | Component test verifies tables, emphasis, code, and inert raw HTML/unsafe links. |
| Settings persistence and theme reload | PASS | Browser test saved API URL/theme, reloaded, and read the saved values. |
| Keyboard operation and narrow layout | PASS | Browser smoke test at 375px showed no page-wide horizontal overflow; component tests cover dialog Escape and focus return. |

No live model-backed request was made during this validation; API behavior was exercised with deterministic strategies and intercepted browser responses.

Final automated run after adding the approval endpoint `202 executing` and safe `500` cases:

| Command | Result |
|---|---|
| `npm test` | PASS — 183 tests, 182 passed, 0 failed, 1 skipped |
| `npm run typecheck` | PASS |
| `npm run web:typecheck` | PASS |
| `npm run web:build` | PASS — production assets generated for `/opspilot/` |
