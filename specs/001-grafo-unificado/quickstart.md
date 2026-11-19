# Quickstart: Grafo Unificado

## Prerequisites

- Node.js 22 LTS
- Project dependencies installed
- Existing application configuration available without reading or editing secrets directly

## Type Check and Test

```powershell
npm run typecheck
npm run test
```

## Validate Automatic Routing

Start the API with the project command:

```powershell
npm run dev
```

Send a request with no `strategy`:

```powershell
curl -X POST http://localhost:3000/chat -H "Content-Type: application/json" -d '{"message":"List active alerts","userId":"quickstart-user"}'
```

Expected outcomes:

- HTTP 200 for a valid processed request
- A `route` trace event from the `router` node
- A supported route value
- Strategy and response events with non-empty `node` fields

## Validate Strategy Override

```powershell
curl -X POST http://localhost:3000/chat -H "Content-Type: application/json" -d '{"message":"Open a database incident","userId":"quickstart-user","strategy":"plan-and-execute"}'
```

Expected outcomes:

- The plan-and-execute strategy executes
- No automatic routing model call occurs
- The route event identifies the override route and router reason

## Validate Reflection Route

```powershell
curl -X POST http://localhost:3000/chat -H "Content-Type: application/json" -d '{"message":"Check GitHub status and summarize it","userId":"quickstart-user","strategy":"reflect:react"}'
```

Expected outcomes:

- Reflection execution is used
- The strategy trace remains attributable to the reflection node

## Validate Unsupported Override

```powershell
curl -X POST http://localhost:3000/chat -H "Content-Type: application/json" -d '{"message":"List alerts","userId":"quickstart-user","strategy":"unknown"}'
```

Expected outcomes:

- Client-facing unknown-strategy error
- No strategy execution and no strategy answer

## Automated Coverage

The implementation should add or update tests for:

- Automatic routing to each supported route
- Unsupported overrides
- Route and answer trace node fields
- Existing chat behavior without a strategy
- Context metrics preservation
- Reflection compatibility

See `data-model.md` and `contracts/chat-route-contract.md` for the expected state and response contract.
