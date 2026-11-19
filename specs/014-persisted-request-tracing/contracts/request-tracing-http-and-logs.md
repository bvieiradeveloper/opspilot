# Request Tracing HTTP and Logs Contract

## `POST /chat`

For an accepted request, the server generates one request identifier and uses it consistently throughout that request.

### Successful response

- The response body includes `requestId` alongside all existing chat response fields.
- The `X-Request-id` response header contains the exact same identifier.
- The identifier is a non-empty string and is unique among accepted requests.
- Existing status, answer, trace, and metrics behavior remains unchanged.

### Processing failures

- After a chat request is accepted, its generated identifier is returned in `X-Request-id` even when processing fails.
- The request record retains a terminal status and safe error classification; metrics are stored when available.
- Existing HTTP status and error-body semantics remain unchanged.
- Malformed bodies rejected before acceptance do not create a request record or receive an accepted-request identifier.

## `GET /request/:id`

Returns the request record and ordered trace for one request.

### Successful response (`200`)

```json
{
  "request": {
    "requestId": "generated-identifier",
    "userId": "operator-identifier",
    "route": "react",
    "status": "succeeded",
    "startedAt": "2026-11-11T12:00:00.000Z",
    "completedAt": "2026-11-11T12:00:01.000Z",
    "statusCode": 200,
    "modelUsed": null,
    "promptTokens": null,
    "latencyMs": 12,
    "metrics": {
      "IICalls": 1,
      "latencyMs": 12
    },
    "errorCode": null
  },
  "trace": [
    {
      "sequence": 1,
      "node": "react",
      "payload": {
        "type": "thought",
        "summary": "Checking current alerts"
      },
      "createdAt": "2026-11-11T12:00:00.500Z"
    }
  ]
}
```

- `trace` is always an array, including when it is empty.
- Events are ordered by ascending `sequence`.
- The request record and each event are validated before response serialization.
- `metrics` is null only when no metrics were available.

### Errors

- An empty, malformed, or invalid `id` returns `400` with the established validation-issues format.
- An unknown identifier returns `404` with a stable `REQUEST_NOT_FOUND` error code and no unrelated record data.

## JSON Lines logger

- Emit one JSON object followed by one newline for each event.
- Include only explicitly allowlisted metadata fields, including route and prompt-token count where available. The logger must not serialize or spread arbitrary event objects.
- Do not include the user identifier in logs.
- Never include chat messages, answers, trace payloads, tool arguments or results, raw exceptions, or other payload-bearing values.
- Include `requestId` where available so events can be correlated with the HTTP response and persisted record.
- Logger output is an operational side effect and does not alter API response bodies.
