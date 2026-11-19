# Quickstart: Persistent Chat History

## Prerequisites

- Node.js 22 LTS or another project-supported runtime with `node:sqlite`.
- Project dependencies installed with `npm install`.

## Run focused tests

From the repository root:

```powershell
npm run test -- src/store/sqlite-conversation-store.test.ts src/http/server.test.ts
npm run typecheck
```

Expected result: the SQLite tests pass against isolated in-memory storage; the HTTP tests use a deterministic fake strategy and do not call a model provider. The tests cover creation, message ordering, persistence across requests, conversation separation, unknown identifiers, the 12-message limit, and the `historyMessages` value.

## Run the full validation suite

```powershell
npm run test
npm run typecheck
```

Expected result: all existing and new tests pass, and TypeScript reports no type errors.

## Manual API validation

Start the configured API in an environment with its required model-provider configuration:

```powershell
npm run dev
```

Send a `POST /chat` request without `conversationId`. Confirm the successful response contains a `conversationId` and `metrics.historyMessages` equal to `0`. Send another request with the returned identifier; confirm the identifier is unchanged and prior messages are reflected in context count. Refer to the [HTTP contract](contracts/http-chat.md) for request and response shapes.

Manual model-backed validation is supplementary; deterministic automated tests are the acceptance check and do not require network access.
