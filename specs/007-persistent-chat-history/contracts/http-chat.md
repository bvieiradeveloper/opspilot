# HTTP Chat and Conversation Store Contracts

## HTTP request

`POST /chat`

Content type: `application/json`

```json
{
  "message": "What did we find about the checkout alerts?",
  "conversationId": "conv-123",
  "strategy": "react",
  "reflect": false
}
```

`message` remains required and non-empty after trimming. `conversationId` is optional; if supplied, it must be a non-empty string identifying an existing conversation. Existing `strategy` and `reflect` behavior is unchanged. Omitting `conversationId` starts a new conversation.

## Successful response

Status: `200 OK`

```json
{
  "conversationId": "conv-123",
  "answer": "The checkout alerts were ...",
  "trace": [
    { "type": "answer", "text": "The checkout alerts were ..." }
  ],
  "metrics": {
    "IICalls": 1,
    "latencyMs": 120.5,
    "historyMessages": 4
  }
}
```

The conversation identifier is included on every successful response. `metrics.historyMessages` is the number of prior messages supplied to the strategy, from 0 to 12. The answer, trace, model-call count, and latency retain their existing meanings and validation.

## Conversation context behavior

- A request without `conversationId` creates a new conversation with no prior messages.
- A request with a known identifier loads up to the 12 most recent prior messages for that conversation.
- The selected history is supplied in chronological order, followed by the current user request.
- User and assistant messages are both part of the persisted history.
- Persisted messages older than the 12-message context window remain available in storage but are not sent as context for that request.
- An identifier never loads messages belonging to another conversation.

## Error responses

### Invalid request

Status: `400 Bad Request`. Existing Zod issue response is retained for invalid request data.

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

The request does not silently create a conversation when an unknown identifier is supplied.

### Existing chat errors

Unknown strategy, request deadline, malformed JSON, rate-limit, and unexpected errors retain the status and safe response behavior documented by the [existing chat contract](../../002-chat-api/contracts/http-chat.md).

## Internal ConversationStore

The application injects a `ConversationStore` into chat orchestration. Its operations are:

| Operation | Input | Result and behavior |
|---|---|---|
| `create` | none | Create a conversation and return its stable identifier |
| `append` | conversation ID and one user/assistant message | Persist the message at the end of that conversation; reject an unknown conversation |
| `lastMessages` | conversation ID and maximum count (12 for chat context) | Return up to the newest matching messages in chronological order; reject an unknown conversation |
| `close` | none | Close the owned SQLite connection |

The SQLite implementation uses bound values, a conversation reference on messages, and an in-memory database path for isolated tests.
