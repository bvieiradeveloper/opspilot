# Chat and Human Approval HTTP Contract

The War Room calls the existing Express API at a separately configured API base URL. All request and response bodies are JSON and are validated with Zod at the service boundary and by the client.

## CORS

- Allow only configured frontend origins, including the explicit local development origin.
- Support `OPTIONS` preflight for the required `POST` requests and `Content-Type` and `Idempotency-Key` headers.
- Expose `Retry-After` when returning an in-progress idempotent request response.
- Do not use wildcard origins or enable credentials for this single-operator feature.
- CORS does not authenticate callers. Production API access must be limited to a trusted network perimeter.

## `POST /chat`

### Request

```json
{
  "message": "Summarize the active checkout alerts",
  "conversationId": "conversation-123",
  "strategy": "react",
  "reflect": false
}
```

- `Idempotency-Key` header: required for War Room submissions; generated once per message and reused for all retries of that message.
- `message`: required, non-empty after trimming.
- `conversationId`: omitted for the first turn; include the service-issued ID on follow-up turns.
- `strategy` and `reflect`: existing optional chat controls.
- The War Room does not submit `userId`; the server associates the request with its configured single-installation identity.
- Existing non-War-Room callers that use the explicit `userId` form remain supported where configured by the API.

### Normal response — `200 OK`

The existing response shape remains intact:

```json
{
  "requestId": "request-123",
  "conversationId": "conversation-123",
  "answer": "There are two active checkout alerts.",
  "trace": [
    { "type": "answer", "node": "react", "text": "There are two active checkout alerts." }
  ],
  "metrics": {
    "IICalls": 1,
    "latencyMs": 120.5,
    "promptTokens": 100,
    "contextBreakdown": {},
    "historyMessages": 2
  }
}
```

The console renders `answer` as Markdown and offers trace inspection for every assistant response.

An identical retry with the same idempotency key and payload replays the original HTTP status/body and does not append another turn or create another approval. Keep idempotency records for 24 hours. While the original request is processing, return a retryable `409` with code `REQUEST_IN_PROGRESS` and a `Retry-After` header without starting a second strategy invocation. Reusing the key with a different normalized payload returns `409` with code `IDEMPOTENCY_KEY_REUSED`.

### Pending authorization — `202 Accepted`

When a tool invocation proposes opening or resolving an incident, the service persists the validated proposal and does not execute it. The response retains the chat result and includes the pending approval:

```json
{
  "requestId": "request-124",
  "conversationId": "conversation-123",
  "answer": "This incident change is waiting for your approval.",
  "trace": [
    { "type": "action", "node": "react", "tool": "open_incident", "args": { "title": "Checkout errors", "service": "checkout-api", "severity": "sev2" } }
  ],
  "metrics": {
    "IICalls": 1,
    "latencyMs": 180.0,
    "promptTokens": 100,
    "contextBreakdown": {},
    "historyMessages": 2
  },
  "approvals": [
    {
      "id": "approval-123",
      "status": "pending",
      "tool": "open_incident",
      "arguments": { "title": "Checkout errors", "service": "checkout-api", "severity": "sev2" },
      "description": "Open a sev2 incident for checkout-api: Checkout errors",
      "createdAt": "2026-11-12T19:00:00.000Z"
    }
  ]
}
```

The `approvals` array is required and non-empty for a valid `202` response. A missing or malformed array is treated by the client as an invalid response, not a valid pending decision. Each proposal gets its own card and independent decision state.

## `POST /approvals/{approvalId}`

### Request

```json
{
  "decision": "approve"
}
```

`decision` is exactly `approve` or `reject`. The service associates it with the single configured installation identity, validates the referenced proposal, and records the decision before invoking any approved tool.

### Confirmed decision — `200 OK`

```json
{
  "approval": {
    "id": "approval-123",
    "status": "executed",
    "decision": "approve",
    "result": { "id": "incident-456", "status": "open" },
    "decidedAt": "2026-11-12T19:01:00.000Z",
    "completedAt": "2026-11-12T19:01:00.010Z"
  }
}
```

A rejected action returns status `rejected` and does not include an execution result. A failed operation returns status `failed` with a safe error code and is not automatically retried. A repeated identical decision returns the existing state/result; it never re-executes a mutation. If the same decision is currently executing, return `202` with status `executing`. A contrary decision after a decision has been recorded returns `409`.

An approved action that fails returns its recorded failed outcome and safe error code; it is not shown as rejected or pending, and is never executed again by retrying the same decision.

## Errors

| Status | Meaning |
|---|---|
| `400` | Invalid JSON or body/path values; response contains validation issues without server details. |
| `404` | Unknown conversation or approval ID. |
| `409` | A decision conflicts with the already recorded decision. |
| `409` | Chat request is still processing (`REQUEST_IN_PROGRESS`) or an idempotency key is reused with a different payload (`IDEMPOTENCY_KEY_REUSED`). |
| `422` | Unsupported strategy or invalid operational action arguments. |
| `503` | Required server-side installation identity or approval capability is not configured/available. |
| `500` | Unexpected failure, with a safe generic message. |

Existing API statuses for model errors and request timeouts remain unchanged. The client must not reinterpret a network/CORS failure as a successful response.

## Autonomy Matrix

| Tool class | Tools | Behavior |
|---|---|---|
| Read-only investigation | `list_alerts`, `list_incidents`, `consultar_runbooks`, `check_provider_status` | Execute automatically; include the normal action/observation trace. |
| Operational mutation | `open_incident`, `resolve_incident` | Persist a pending approval and return HTTP 202; execute only after explicit approval. |
| Explicit user-scoped memory operation | Existing memory tools | Retain their current explicit-request and user-scoped behavior; they are outside this operational mutation gate. |
