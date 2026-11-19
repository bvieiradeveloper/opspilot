# Quickstart: Chat API

## Prerequisites

- Node.js 22 LTS and npm.
- Project dependencies installed.
- No model credentials are required for the deterministic integration tests.

## Validate the Feature

From the repository root, run:

```powershell
npm run typecheck
npm run test
```

The HTTP integration tests start the Express app with deterministic fake strategies and verify the default strategy, explicit strategy selection, reflection, invalid input, unknown strategy, and deadline behavior. They use a temporary loopback listener and do not call OpenRouter or any external service. The deadline duration is shortened only through the app-factory test option; production uses 180 seconds.

## Run the API

Provide any required model credentials through the process environment using the existing model configuration, then run:

```powershell
npm run dev
```

The server listens on its configured port (default `3000`). A caller can submit a request with:

```powershell
$body = @{ message = 'Summarize the active checkout alerts'; strategy = 'react'; reflect = $false } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/chat' -ContentType 'application/json' -Body $body
```

Expected success is HTTP `200` with `answer`, `trace`, and `metrics`. Invalid bodies return `400`, unknown strategies return `422`, and requests reaching the 180-second processing deadline return `504`.

## Contract Reference

See [HTTP Chat Contract](contracts/http-chat.md) for request fields, response shapes, and error examples.