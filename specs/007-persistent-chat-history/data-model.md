# Data Model: Persistent Chat History

## Conversation

Represents a chat history that callers can resume with its identifier.

| Field | Type | Rules |
|---|---|---|
| `id` | string | Required, unique stable identifier generated when a conversation is created |
| `createdAt` | ISO timestamp text | Required creation time |

A conversation can exist before it has any messages. Supplying an unknown conversation ID is an error; it does not create a replacement conversation.

## Message

Represents one user or assistant contribution in a conversation.

| Field | Type | Rules |
|---|---|---|
| `conversationId` | string | Required reference to an existing conversation |
| `role` | `user \| assistant` | Required closed set |
| `content` | string | Required message text |
| `sequence` | integer | Required stable order within persisted messages |
| `createdAt` | ISO timestamp text | Required creation time |

Messages are retrieved in chronological sequence. For a resumed request, the context consists of the latest 12 prior messages, selected from newest to oldest and then returned in chronological order. The current request is not part of the prior-history count.

## Chat Request

| Field | Type | Rules |
|---|---|---|
| `message` | string | Required, non-empty after trimming, following the existing chat contract |
| `conversationId` | string or omitted | Optional; when provided it must identify an existing conversation |
| `strategy` | string or omitted | Existing optional strategy selection and default behavior are unchanged |
| `reflect` | boolean or omitted | Existing optional reflection preference and default behavior are unchanged |

## Chat Response

The existing `answer` and `trace` fields remain unchanged. The successful response also includes:

| Field | Type | Rules |
|---|---|---|
| `conversationId` | string | Required identifier for the conversation used by the request |
| `metrics.historyMessages` | integer | Required count of prior messages supplied as context; from 0 through 12 |

Existing `metrics.IICalls` and `metrics.latencyMs` retain their current meaning.

## Relationships and lifecycle

- One conversation has zero or more messages.
- Every message belongs to exactly one conversation.
- User and assistant messages are stored in the same ordered history.
- A request without an identifier creates a new conversation; a request with a valid identifier reuses it.
- The 12-message context window does not delete older persisted messages.
