# Request Analytics Quickstart

## Prerequisites

- Install the project dependencies.
- Ensure the API is configured to use its SQLite request database.
- Start the API using `npm run dev`.

## Validate the endpoint

1. Submit one or more requests to `POST /chat`.
2. Request `GET /states?since=24h`.
3. Confirm `overall` includes requests from the last 24 hours and contains request/error counts, input-token usage, known USD cost, and latency percentiles.
4. Confirm `byRoute` and `byModel` contain groups whose totals reconcile with `overall`, including `null` groups for unknown values.
5. Request `GET /states` without `since` and confirm the same default window is used.
6. Request `GET /states?since=0h` and `GET /states?since=31d`; confirm both receive a validation error rather than a summary.
7. Confirm a model ending in `:free` contributes a measured cost of zero, while a paid model without reported cost increments `unavailableRequests`.

## Automated validation

```powershell
npm test
npm run typecheck
```

Expected: all tests pass, and TypeScript reports no errors. Use the contract in [`contracts/request-analytics-http.md`](./contracts/request-analytics-http.md) and definitions in [`data-model.md`](./data-model.md) when checking response semantics.
