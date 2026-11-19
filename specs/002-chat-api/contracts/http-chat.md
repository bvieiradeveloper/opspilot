# HTTP Chat Contract

## Request

`POST /chat`

Content type: `application/json`

```json
{
  "message": "Summarize the active checkout alerts",
  "conversationId": "conversation-123",
  "strategy": "react",
  "reflect": false
}
```

`message` is required and must be a non-empty string after trimming. `conversationId` is optional; when provided, it must identify an existing conversation. When omitted, a new conversation is created. `strategy` is an optional registered base name; it defaults to `react`. `reflect` is an optional boolean and defaults to `false`.

## Successful Response

Status: `200 OK`

```json
{
  "conversationId": "conversation-123",
  "answer": "There are two active checkout alerts.",
  "trace": [
    { "type": "answer", "text": "There are two active checkout alerts." }
  ],
  "metrics": {
    "IICalls": 1,
    "latencyMs": 120.5,
    "historyMessages": 4
  }
}
```

The `trace` array uses the existing reasoning trace event variants. Metrics must include non-negative `IICalls` and `latencyMs` values.
Every successful response includes the conversation identifier used for the request. `historyMessages` is the count of prior messages supplied to the strategy as context and is between 0 and 12.

## Conversation history

For a conversation follow-up, the API supplies up to the 12 most recent prior user and assistant messages in chronological order, followed by the current user request. Messages remain persisted beyond this context window. An unknown supplied conversation identifier returns `404` and does not create a replacement conversation.

## Error Responses

### Invalid body

Status: `400 Bad Request`

```json
{
  "issues": [
    {
      "code": "too_small",
      "path": ["message"],
      "message": "A non-empty message is required."
    }
  ]
}
```

Schema validation failures return the Zod issue list. Malformed JSON is also rejected with `400` and a safe client-error response; parser internals are not exposed.

### Unknown strategy

Status: `422 Unprocessable Entity`

```json
{
  "error": {
    "code": "UNKNOWN_STRATEGY",
    "message": "The requested strategy is not supported."
  }
}
```

### Unknown conversation

Status: `404 Not Found`

```json
{
  "error": {
    "code": "UNKNOWN_CONVERSATION",
    "message": "The requested conversation was not found."
  }
}
```

### Processing deadline

Status: `504 Gateway Timeout`

```json
{
  "error": {
    "code": "REQUEST_TIMEOUT",
    "message": "The request exceeded the processing time limit."
  }
}
```

The API aborts the strategy signal after 180 seconds and returns the timeout response.

### Unexpected failure

Status: `500 Internal Server Error`

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "The request could not be completed."
  }
}
```

Unexpected exceptions and provider details are not returned to callers.