# `/chat` Route Contract

## Request

```json
{
  "message": "List the firing alerts",
  "userId": "test-user",
  "conversationId": "conversation-optional",
  "strategy": "react",
  "reflect": false
}
```

`strategy` is optional. Supported values are:

- `react`
- `plan-and-execute`
- `reflect:react`

When `strategy` is omitted, automatic routing selects one supported value. `reflect: true` is the compatibility form of the `reflect:react` route when `strategy` is omitted. When both `strategy` and `reflect` are supplied, `strategy` remains the explicit override and `reflect` does not change it.

## Successful Response Shape

```json
{
  "conversationId": "conversation-example",
  "answer": "Two alerts are firing.",
  "trace": [
    {
      "type": "route",
      "node": "router",
      "route": "react",
      "reason": "The request asks for an operational lookup."
    },
    {
      "type": "answer",
      "node": "react",
      "text": "Two alerts are firing."
    }
  ],
  "metrics": {
    "IICalls": 2,
    "latencyMs": 120,
    "promptTokens": null,
    "contextBreakdown": {
      "request": 5
    },
    "historyMessages": 0
  }
}
```

## Trace Rules

- Every successful or partially successful trace event must contain a non-empty `node` field.
- A route event must contain `route` and `reason`.
- Strategy events retain their existing event payloads and add `node`.
- Summary events, if present, use their graph context node attribution.
- The response event uses node `response` where the graph exposes a response-stage event.

## Validation Errors

- Missing or empty `message`: HTTP 400.
- Missing or empty `userId`: HTTP 400.
- Unknown strategy value: HTTP error with unknown-strategy semantics and no strategy execution.
- Invalid route model output: processing error; no unsupported route is passed to strategy execution.

## Compatibility

Existing clients can omit `strategy`; automatic routing preserves a valid chat response rather than requiring route configuration.
