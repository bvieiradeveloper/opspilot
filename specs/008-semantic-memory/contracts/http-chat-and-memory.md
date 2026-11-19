# HTTP and Chat Contracts

## `POST /chat`

The request continues to accept existing chat options and now requires `userId`.

```json
{
  "message": "Which notifications should I prioritize?",
  "userId": "user-123",
  "conversationId": "conversation-optional",
  "strategy": "react",
  "reflect": false
}
```

- `message`: required non-empty string.
- `userId`: required non-empty string; validated and passed as trusted request scope, not taken from model-generated tool arguments.
- `conversationId`, `strategy`, and `reflect`: retain their existing optional behavior.

The successful response keeps the existing `{ conversationId, answer, trace, metrics }` shape. Memory records are not returned as a separate response field. Relevant facts are passed to the selected reasoning strategy as explicitly delimited contextual data, not as user instructions. A request without a valid `userId` receives HTTP 400 and causes no memory read, write, or learning.

After the response is sent, a learning reflector may analyze the completed turn and save a durable fact asynchronously. Its failure cannot rewrite the response; it must be reported through operational error reporting.

Natural-language forget requests are handled by the chat agent using memory operations bound to the validated request's `userId`. If the candidate is ambiguous, the assistant asks which fact to forget and deletes nothing until the user identifies one.

## `POST /memories`

Create a memory explicitly.

**Request**

```json
{
  "userId": "user-123",
  "fact": "I prefer critical alerts to be shown first."
}
```

Both fields are required non-empty strings. Invalid input returns HTTP 400 with Zod validation issues.

**Created response — HTTP 201**

```json
{
  "memory": {
    "id": "memory-id",
    "fact": "I prefer critical alerts to be shown first.",
    "createdAt": "2026-10-21T22:00:00.000Z"
  },
  "created": true
}
```

If an existing memory for that user has similarity strictly greater than `0.92`, return HTTP 200 with that existing memory and `"created": false`; do not create a duplicate.

## `DELETE /memories/:memoryId?userId=...`

Delete one memory explicitly. Both a non-empty `memoryId` path parameter and non-empty `userId` query parameter are required.

- HTTP 204 with no body when the memory belongs to that user and is deleted.
- HTTP 404 with a generic unknown-memory error when no row matches both values. This response must not reveal whether the ID belongs to another user.
- HTTP 400 for malformed identifiers or missing `userId`.

## Natural-language learning operations

- The learning reflector saves a concise durable fact only after successful chat completion and invokes the same deduplicating store operation as `POST /memories`.
- A forget request is user-scoped. The system resolves the user's description against eligible semantic matches and deletes only when exactly one memory matches; it returns candidate facts for clarification when multiple matches exist and deletes nothing when no match exists.
- Tool interfaces do not accept an owner identifier from the model; request scope supplies it.

## Test seams

HTTP and chat tests inject a memory store, deterministic embedder, learning reflector, and fake strategy. Tests must verify that another user's memories are neither selected nor deleted, that invalid user IDs stop processing before store access, and that the response does not wait for asynchronous learning.
