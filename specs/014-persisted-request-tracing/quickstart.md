# Quickstart: Persisted Request Tracing

## Prerequisites

- Node.js 22 LTS and the repository's installed dependencies.
- No model-provider credentials or external network access are needed for the deterministic test scenarios.

## Validate

Run the isolated tests and type check:

```powershell
npm run test
npm run typecheck
```

Expected outcomes:

- SQLite store tests verify request lifecycle persistence, metrics, ordered trace retrieval, unknown IDs, and reopening a file-backed database.
- HTTP tests verify matching body/header request IDs, request lookup, and not-found behavior.
- Logger tests parse one JSON line per event and verify known request/trace payload strings are absent.
- Both commands exit successfully.

## End-to-end scenario

1. Start the API with the project's configured test/development settings and a writable SQLite database path.
2. Submit a valid deterministic `POST /chat` request.
3. Confirm `requestId` in the response body matches `X-Request-id`.
4. Call `GET /request/{requestId}` and confirm the request metrics and trace appear in occurrence order.
5. Search captured logger output for the request ID and event metadata; confirm payload text is absent.
6. Restart the service using the same database and repeat the lookup; the same request record and ordered trace remain available.

See [the HTTP and logs contract](./contracts/request-tracing-http-and-logs.md) and [the data model](./data-model.md) for exact response and persistence shapes.
