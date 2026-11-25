# Team Mode Chat Contract

Team mode is an explicit strategy of the existing `POST /chat` endpoint. It does not create a new endpoint or change the default strategy.

## Request

The request uses the existing War Room chat contract and requires its idempotency key. Team mode must not be accepted through the legacy chat path if that path would expose direct incident-mutation tools.

```http
POST /chat
Content-Type: application/json
Idempotency-Key: <unique-key>
```

```json
{
  "message": "Investigate the active payment-service incident",
  "conversationId": "optional-existing-conversation-id",
  "strategy": "team",
  "reflect": false
}
```

| Field | Required | Rules |
|---|---:|---|
| `message` | Yes | Trimmed, non-empty incident request |
| `conversationId` | No | Trimmed, non-empty identifier when supplied |
| `strategy` | Yes for team mode | Literal `team` |
| `reflect` | No | Existing boolean field; not used to bypass explicit team selection |
| `Idempotency-Key` | Yes | Existing War Room idempotency contract |

## Successful Response

The response retains the existing chat response envelope (`requestId`, `conversationId`, `answer`, `trace`, `metrics`, and optional pending `approvals`). Approval proposals continue to use the existing 202 response behavior.

Team transitions add this event to the `trace` array:

```json
{
  "type": "handoff",
  "node": "team",
  "from": "analyst",
  "to": "planner",
  "brief": "Use the confirmed alert and runbook findings to prepare an incident response plan."
}
```

`from` is `supervisor`, `analyst`, `planner`, or `executor`. `to` is `analyst`, `planner`, or `executor`. `brief` is a non-empty operator-safe assignment summary. Event ordering in the trace is the handoff ordering.

## Failure Behavior

- Invalid request fields return the existing HTTP 400 validation response.
- Unsupported or unavailable team execution returns a clear non-success response; it must not fall back to a different strategy or direct-mutation tools.
- Missing approval support for a state-changing executor action returns an explicit unavailable/blocked result and no incident mutation.
- Reaching eight emitted handoffs ends coordination; no ninth handoff or role dispatch occurs. The chat response reports the available result or the limit outcome.
- Existing model-unavailable, request-timeout, idempotency, and approval response behavior remains unchanged.
